from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status as http_status

from .models import ReservationJob
from .slack import send_slack
from .serializers import (
    ReservationJobSerializer,
    SearchRequestSerializer,
    ReserveRequestSerializer,
)
from .srt_service import (
    STATIONS,
    search_trains,
    try_reserve,
    verify_login,
    SRTSoldOut,
    SRTAuthError,
    SRTServiceError,
)
from .tasks import attempt_reservation


@api_view(["GET"])
def stations(request):
    """예약 가능한 역 목록."""
    return Response({"stations": STATIONS})


@api_view(["POST"])
def login_check(request):
    """SRT 자격증명 검증."""
    srt_id = request.data.get("srt_id")
    srt_pw = request.data.get("srt_pw")
    if not srt_id or not srt_pw:
        return Response(
            {"detail": "srt_id 와 srt_pw 가 필요합니다."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        verify_login(srt_id, srt_pw)
    except SRTAuthError as e:
        return Response({"detail": str(e)}, status=http_status.HTTP_401_UNAUTHORIZED)
    except SRTServiceError as e:
        return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
    return Response({"ok": True})


@api_view(["POST"])
def search(request):
    """열차 검색 (매진 포함)."""
    s = SearchRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    try:
        trains = search_trains(
            srt_id=d["srt_id"],
            srt_pw=d["srt_pw"],
            dep=d["dep"],
            arr=d["arr"],
            date=d["date"],
            time=d.get("time", "000000"),
            available_only=False,
        )
    except SRTAuthError as e:
        return Response({"detail": str(e)}, status=http_status.HTTP_401_UNAUTHORIZED)
    except SRTServiceError as e:
        return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)
    return Response({"trains": trains})


@api_view(["POST"])
def reserve(request):
    """예약 요청.

    1) 즉시 1회 시도해서 자리가 있으면 바로 예약 완료.
    2) 자리가 없으면 PENDING 작업으로 등록하고 Celery 가 5초마다 재시도.
    """
    s = ReserveRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data

    job = ReservationJob.objects.create(
        srt_id=d["srt_id"],
        srt_pw=d["srt_pw"],
        dep=d["dep"],
        arr=d["arr"],
        date=d["date"],
        time=d.get("time", "000000"),
        train_number=d["train_number"],
        train_label=d.get("train_label", ""),
        seat_type=d.get("seat_type", "GENERAL_FIRST"),
        status=ReservationJob.Status.PENDING,
    )

    # 즉시 1회 시도
    try:
        result = try_reserve(
            srt_id=d["srt_id"],
            srt_pw=d["srt_pw"],
            dep=d["dep"],
            arr=d["arr"],
            date=d["date"],
            time=d.get("time", "000000"),
            train_number=d["train_number"],
            seat_type=d.get("seat_type", "GENERAL_FIRST"),
        )
    except SRTAuthError as e:
        job.status = ReservationJob.Status.FAILED
        job.last_message = f"로그인 실패: {e}"
        job.attempts = 1
        job.save()
        return Response(
            {"detail": str(e), "job": ReservationJobSerializer(job).data},
            status=http_status.HTTP_401_UNAUTHORIZED,
        )
    except SRTSoldOut as e:
        # 자리 없음 → 백그라운드 재시도 등록
        job.attempts = 1
        job.last_message = f"자리 없음, 5초마다 재시도 시작: {e}"
        job.save()
        send_slack(
            f"🔄 [{job.train_label or f'{job.dep}→{job.arr} {job.date} {job.train_number}'}] "
            f"시도 1회 — 자리 없음, 5초마다 재시도 시작"
        )
        async_result = attempt_reservation.apply_async(
            args=[job.id], countdown=5
        )
        job.task_id = async_result.id
        job.save()
        return Response(
            {
                "queued": True,
                "message": "자리가 없어 5초마다 자동 재시도합니다.",
                "job": ReservationJobSerializer(job).data,
            },
            status=http_status.HTTP_202_ACCEPTED,
        )
    except SRTServiceError as e:
        job.status = ReservationJob.Status.FAILED
        job.last_message = f"오류: {e}"
        job.attempts = 1
        job.save()
        return Response(
            {"detail": str(e), "job": ReservationJobSerializer(job).data},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # 즉시 성공
    job.status = ReservationJob.Status.RESERVED
    job.attempts = 1
    job.reservation_number = result.get("reservation_number", "")
    job.result = result
    job.last_message = "예약 성공! " + result.get("summary", "")
    job.save()
    send_slack(
        f"✅ 예약 성공! [{job.train_label or f'{job.dep}→{job.arr} {job.date} {job.train_number}'}] "
        f"{result.get('summary', '')}\n"
        f"예약번호 {job.reservation_number} · 결제 기한 내 결제하세요.",
        mention_channel=True,
    )
    return Response(
        {
            "reserved": True,
            "message": "즉시 예약에 성공했습니다.",
            "job": ReservationJobSerializer(job).data,
        },
        status=http_status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def job_list(request):
    jobs = ReservationJob.objects.all()[:100]
    return Response({"jobs": ReservationJobSerializer(jobs, many=True).data})


@api_view(["GET"])
def job_detail(request, job_id):
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    return Response(ReservationJobSerializer(job).data)


@api_view(["POST"])
def job_cancel(request, job_id):
    """진행중인 재시도 작업을 취소."""
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    if job.status == ReservationJob.Status.PENDING:
        job.status = ReservationJob.Status.CANCELLED
        job.last_message = "사용자에 의해 취소됨."
        job.save()
    return Response(ReservationJobSerializer(job).data)

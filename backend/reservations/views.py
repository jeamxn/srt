from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status as http_status

from .models import ReservationJob
from .serializers import (
    ReservationJobSerializer,
    SearchRequestSerializer,
    ReserveRequestSerializer,
)
from .srt_service import (
    STATIONS,
    search_trains,
    verify_login,
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
    """예약 요청을 큐에 등록만 한다 (즉시 시도하지 않음).

    실제 재시도 루프는 사용자가 '예약 현황'에서 시작 버튼을 눌러야 시작된다.
    재시도 간격(retry_interval_ms)도 함께 저장한다.
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
        retry_interval_ms=d.get("retry_interval_ms", 5000),
        status=ReservationJob.Status.QUEUED,
        last_message="대기열에 등록됨. '예약 현황'에서 시작을 누르면 재시도를 시작합니다.",
    )
    return Response(
        {
            "queued": True,
            "message": "예약 현황에 추가했습니다. 시작을 누르면 자동 예약을 시작합니다.",
            "job": ReservationJobSerializer(job).data,
        },
        status=http_status.HTTP_202_ACCEPTED,
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
def job_start(request, job_id):
    """대기중(QUEUED) 작업의 재시도 루프를 시작한다.

    요청 본문에 retry_interval_ms 가 있으면 간격을 갱신한 뒤 시작한다.
    """
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    if job.status not in (
        ReservationJob.Status.QUEUED,
        ReservationJob.Status.PAUSED,
    ):
        return Response(
            {"detail": "시작할 수 없는 상태입니다.", "job": ReservationJobSerializer(job).data},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    interval = request.data.get("retry_interval_ms")
    if interval is not None:
        try:
            iv = int(interval)
            if iv >= 100:
                job.retry_interval_ms = iv
        except (TypeError, ValueError):
            pass
    job.status = ReservationJob.Status.PENDING
    job.last_message = "재시도를 시작합니다."
    job.save()
    async_result = attempt_reservation.apply_async(args=[job.id], countdown=0)
    job.task_id = async_result.id
    job.save()
    return Response(ReservationJobSerializer(job).data)


@api_view(["POST"])
def job_cancel(request, job_id):
    """진행중인 재시도 작업을 완전 취소."""
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    if job.status in (
        ReservationJob.Status.QUEUED,
        ReservationJob.Status.PENDING,
        ReservationJob.Status.PAUSED,
    ):
        job.status = ReservationJob.Status.CANCELLED
        job.last_message = "사용자에 의해 취소됨."
        job.save()
    return Response(ReservationJobSerializer(job).data)


@api_view(["POST"])
def job_pause(request, job_id):
    """재시도를 일시중지 (나중에 resume 가능)."""
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    if job.status == ReservationJob.Status.PENDING:
        job.status = ReservationJob.Status.PAUSED
        job.last_message = f"일시중지됨 (시도 {job.attempts}회). 재개하면 이어서 재시도합니다."
        job.save()
    return Response(ReservationJobSerializer(job).data)


@api_view(["POST"])
def job_resume(request, job_id):
    """일시중지된 작업을 재개 — 재시도 루프를 다시 큐잉.

    요청 본문에 retry_interval_ms 가 있으면 간격을 갱신한 뒤 재개한다.
    """
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return Response(status=http_status.HTTP_404_NOT_FOUND)
    if job.status == ReservationJob.Status.PAUSED:
        interval = request.data.get("retry_interval_ms")
        if interval is not None:
            try:
                iv = int(interval)
                if iv >= 100:
                    job.retry_interval_ms = iv
            except (TypeError, ValueError):
                pass
        job.status = ReservationJob.Status.PENDING
        job.last_message = "재개됨. 재시도를 다시 시작합니다."
        job.save()
        async_result = attempt_reservation.apply_async(args=[job.id], countdown=1)
        job.task_id = async_result.id
        job.save()
    return Response(ReservationJobSerializer(job).data)


def _active_jobs():
    """아직 끝나지 않은(대기/진행/일시중지) 작업 쿼리셋."""
    return ReservationJob.objects.filter(
        status__in=[
            ReservationJob.Status.QUEUED,
            ReservationJob.Status.PENDING,
            ReservationJob.Status.PAUSED,
        ]
    )


def _all_jobs_payload(count: int):
    """일괄 작업 응답: 영향 건수 + 전체 작업 목록(완료/종료 포함)."""
    jobs = ReservationJob.objects.all()[:100]
    return {
        "affected": count,
        "jobs": ReservationJobSerializer(jobs, many=True).data,
    }


@api_view(["POST"])
def jobs_pause_all(request):
    """진행중(PENDING)인 모든 작업을 일시중지."""
    count = 0
    for job in ReservationJob.objects.filter(status=ReservationJob.Status.PENDING):
        job.status = ReservationJob.Status.PAUSED
        job.last_message = f"일시중지됨 (시도 {job.attempts}회). 재개하면 이어서 재시도합니다."
        job.save()
        count += 1
    return Response(_all_jobs_payload(count))


@api_view(["POST"])
def jobs_resume_all(request):
    """일시중지/대기중인 모든 작업의 재시도를 시작/재개.

    PAUSED → 재개, QUEUED → 시작. 둘 다 PENDING 으로 만들고 루프를 큐잉.
    """
    count = 0
    for job in ReservationJob.objects.filter(
        status__in=[ReservationJob.Status.PAUSED, ReservationJob.Status.QUEUED]
    ):
        job.status = ReservationJob.Status.PENDING
        job.last_message = "재시도를 시작합니다."
        job.save()
        async_result = attempt_reservation.apply_async(args=[job.id], countdown=0)
        job.task_id = async_result.id
        job.save()
        count += 1
    return Response(_all_jobs_payload(count))


@api_view(["POST"])
def jobs_set_interval_all(request):
    """진행 중이지 않은(끝나지 않은) 모든 작업의 재시도 간격을 일괄 설정."""
    interval = request.data.get("retry_interval_ms")
    try:
        iv = int(interval)
    except (TypeError, ValueError):
        return Response(
            {"detail": "retry_interval_ms 가 필요합니다."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if iv < 100:
        return Response(
            {"detail": "재시도 간격은 최소 100ms 입니다."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    count = _active_jobs().update(retry_interval_ms=iv)
    return Response(_all_jobs_payload(count))

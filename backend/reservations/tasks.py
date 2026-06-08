"""Celery 태스크: 자리 없을 때 5초마다 예약 재시도.

흐름:
- 예약 요청이 들어오면 attempt_reservation 태스크가 즉시 1회 시도.
- 성공하면 RESERVED 로 종료.
- 자리 없음(SRTSoldOut)이면 RESERVE_RETRY_INTERVAL(기본 5초) 뒤 자기 자신을 재호출.
- RESERVE_MAX_ATTEMPTS 초과하거나 작업이 취소되면 종료.
"""
from celery import shared_task
from django.conf import settings

from .models import ReservationJob
from .srt_service import (
    try_reserve,
    SRTSoldOut,
    SRTServiceError,
    SRTAuthError,
)


@shared_task(bind=True)
def attempt_reservation(self, job_id: int):
    try:
        job = ReservationJob.objects.get(id=job_id)
    except ReservationJob.DoesNotExist:
        return {"error": f"job {job_id} not found"}

    # 이미 끝났거나 취소된 작업이면 중단
    if job.status in (
        ReservationJob.Status.RESERVED,
        ReservationJob.Status.CANCELLED,
        ReservationJob.Status.FAILED,
    ):
        return {"status": job.status, "note": "already finished"}

    job.attempts += 1
    job.task_id = self.request.id or ""

    interval = settings.RESERVE_RETRY_INTERVAL
    max_attempts = settings.RESERVE_MAX_ATTEMPTS

    try:
        result = try_reserve(
            srt_id=job.srt_id,
            srt_pw=job.srt_pw,
            dep=job.dep,
            arr=job.arr,
            date=job.date,
            time=job.time,
            train_number=job.train_number,
            seat_type=job.seat_type,
        )
    except SRTSoldOut as e:
        # 자리 없음 → 재시도
        job.last_message = f"시도 {job.attempts}회: {e}"
        if job.attempts >= max_attempts:
            job.status = ReservationJob.Status.FAILED
            job.last_message = f"최대 시도 횟수({max_attempts}) 초과로 중단."
            job.save()
            return {"status": "FAILED", "reason": "max attempts"}
        job.save()
        # interval 초 뒤 재시도
        attempt_reservation.apply_async(args=[job_id], countdown=interval)
        return {"status": "RETRY", "attempt": job.attempts}
    except SRTAuthError as e:
        job.status = ReservationJob.Status.FAILED
        job.last_message = f"로그인 실패: {e}"
        job.save()
        return {"status": "FAILED", "reason": "auth"}
    except SRTServiceError as e:
        job.status = ReservationJob.Status.FAILED
        job.last_message = f"오류: {e}"
        job.save()
        return {"status": "FAILED", "reason": str(e)}

    # 성공
    job.status = ReservationJob.Status.RESERVED
    job.reservation_number = result.get("reservation_number", "")
    job.result = result
    job.last_message = "예약 성공! " + result.get("summary", "")
    job.save()
    return {"status": "RESERVED", "reservation_number": job.reservation_number}

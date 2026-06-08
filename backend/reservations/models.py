from django.db import models


class ReservationJob(models.Model):
    """예약 작업.

    사용자가 요청한 1건의 예약을 표현한다.
    자리가 있으면 즉시 RESERVED, 없으면 PENDING 으로 두고
    Celery 워커가 5초마다 재시도한다.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "대기/재시도중"
        PAUSED = "PAUSED", "일시중지"
        RESERVED = "RESERVED", "예약완료"
        FAILED = "FAILED", "실패"
        CANCELLED = "CANCELLED", "취소됨"

    # SRT 자격증명 (예약 수행에 필요)
    srt_id = models.CharField(max_length=100)
    srt_pw = models.CharField(max_length=200)

    # 열차 조건
    dep = models.CharField(max_length=20)
    arr = models.CharField(max_length=20)
    date = models.CharField(max_length=8, help_text="yyyyMMdd")
    time = models.CharField(max_length=6, default="000000", help_text="hhmmss")
    train_number = models.CharField(max_length=10)
    seat_type = models.CharField(max_length=20, default="GENERAL_FIRST")

    # 표시용 메타
    train_label = models.CharField(max_length=200, blank=True, default="")

    # 상태
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    attempts = models.IntegerField(default=0)
    last_message = models.TextField(blank=True, default="")

    # 예약 성공 결과
    reservation_number = models.CharField(max_length=40, blank=True, default="")
    result = models.JSONField(null=True, blank=True)

    # 진행중인 celery task id (취소/추적용)
    task_id = models.CharField(max_length=80, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.status}] {self.dep}->{self.arr} {self.date} {self.train_number}"

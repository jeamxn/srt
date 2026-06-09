from django.db import models


class AuthToken(models.Model):
    """SRT 로그인 확인 성공 시 발급되는 세션 토큰.

    token → user_id(SRT 회원번호) 매핑. 클라이언트는 이 토큰을
    X-Auth-Token 헤더로 보내고, 서버는 해당 user_id 의 작업만 보여준다.
    """

    token = models.CharField(max_length=64, unique=True, db_index=True)
    user_id = models.CharField(max_length=100, help_text="SRT 회원번호")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user_id} ({self.token[:8]}…)"


class UserPref(models.Model):
    """회원번호(user_id)별 사용자 설정.

    예약 성공 알림을 받을 기본 Slack 멤버를 계정 단위로 저장한다.
    어느 브라우저/기기에서 로그인하든 동일하게 복원된다.
    """

    user_id = models.CharField(max_length=100, unique=True, db_index=True)
    slack_user_id = models.CharField(max_length=40, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user_id} → slack:{self.slack_user_id or '-'}"


class ReservationJob(models.Model):
    """예약 작업.

    사용자가 요청한 1건의 예약을 표현한다.
    자리가 있으면 즉시 RESERVED, 없으면 PENDING 으로 두고
    Celery 워커가 5초마다 재시도한다.
    """

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "대기중(미시작)"
        PENDING = "PENDING", "재시도중"
        PAUSED = "PAUSED", "일시중지"
        RESERVED = "RESERVED", "예약완료"
        FAILED = "FAILED", "실패"
        CANCELLED = "CANCELLED", "취소됨"

    # 소유자 (SRT 회원번호). 로그인한 계정 기준으로 작업을 격리한다.
    user_id = models.CharField(max_length=100, db_index=True, default="")

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
        max_length=12, choices=Status.choices, default=Status.QUEUED
    )
    attempts = models.IntegerField(default=0)

    # 재시도 간격 (밀리초 단위). 잡별로 사용자가 설정.
    retry_interval_ms = models.IntegerField(default=5000)
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

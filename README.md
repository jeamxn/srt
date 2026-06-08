# SRT 자동 예약 (srt-auto-reserve)

[SRTrain](https://pypi.org/project/SRTrain/) 을 이용해 SRT 기차표를 검색하고,
원하는 열차를 대기열에 담아두면 사용자가 정한 **간격(ms/초/분)** 으로 자리가 날 때까지
**자동으로 재시도**해주는 웹 애플리케이션입니다.

## 구성

| 영역 | 기술 |
|------|------|
| 백엔드 | Python / Django + Django REST Framework |
| 비동기 작업 | Celery + Redis (작업별 간격 자동 재시도) |
| DB | PostgreSQL |
| 프론트 | React Router (v7, framework mode) |
| 배포 | Docker Compose |

## 동작 방식

1. 사용자가 SRT **아이디(전화번호/이메일/회원번호) + 비밀번호** 를 입력합니다.
2. 출발역 / 도착역 / 날짜 / 시간대를 선택해 열차를 검색합니다.
3. 원하는 열차에서 **대기열 추가** 를 누르면 예약 작업이 `QUEUED` 상태로 등록됩니다.
4. **예약 현황**에서 작업별 재시도 간격(ms/초/분)을 정하고 **시작** 을 누르면 재시도가 시작됩니다.
   - 진행 중에는 **일시중지**(나중에 재개 가능) 하거나 **재시도 중단**(확인 후 완전 취소) 할 수 있습니다.
5. 예약이 성공하면 작업 상태가 `RESERVED` 로 바뀝니다. (결제는 SRT 앱/홈페이지에서 진행)

> SRTrain 은 결제 기능을 제공하지 않습니다. 예약까지만 자동화하며, 결제 기한 내에 직접 결제해야 합니다.

## 로컬 실행

```bash
docker compose up --build
```

- 프론트: http://localhost:3000
- 백엔드 API: http://localhost:8000/api/

## 개발

`backend/`, `frontend/` 각 디렉터리의 README 참고.

## 주의

- SRT 계정 비밀번호는 예약 작업 수행에 필요하여 DB 에 저장됩니다. 신뢰할 수 있는 환경에서만 운영하세요.
  (운영 시 `DJANGO_SECRET_KEY` 와 DB 암호화 등 추가 보안 조치를 권장합니다.)

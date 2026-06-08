# SRT 자동 예약 (srt-auto-reserve)

[SRTrain](https://pypi.org/project/SRTrain/) 을 이용해 SRT 기차표를 검색하고, 자리가 있으면 즉시 예약하고
없으면 **5초마다 자동으로 재시도**해주는 웹 애플리케이션입니다.

## 구성

| 영역 | 기술 |
|------|------|
| 백엔드 | Python / Django + Django REST Framework |
| 비동기 작업 | Celery + Redis (5초 간격 자동 재시도) |
| DB | PostgreSQL |
| 프론트 | React Router (v7, framework mode) |
| 배포 | Docker Compose |

## 동작 방식

1. 사용자가 SRT **아이디(전화번호/이메일/회원번호) + 비밀번호** 를 입력합니다.
2. 출발역 / 도착역 / 날짜 / 시간대를 선택해 열차를 검색합니다.
3. 원하는 열차를 선택해 예약을 요청합니다.
   - 자리가 있으면 **즉시 예약**됩니다.
   - 자리가 없으면 예약 작업이 등록되고, Celery 워커가 **5초마다 재시도**합니다.
4. 예약이 성공하면 작업 상태가 `RESERVED` 로 바뀝니다. (결제는 SRT 앱/홈페이지에서 진행)

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

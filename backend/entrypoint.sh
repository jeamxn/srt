#!/usr/bin/env bash
set -e

# DB 가 뜰 때까지 대기
echo "Waiting for postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
until python -c "import socket,os,sys; s=socket.socket(); s.settimeout(2)
try:
    s.connect((os.environ.get('POSTGRES_HOST','db'), int(os.environ.get('POSTGRES_PORT','5432'))))
    sys.exit(0)
except Exception:
    sys.exit(1)" 2>/dev/null; do
  echo "  ...postgres not ready, retrying in 2s"
  sleep 2
done
echo "Postgres is up."

# 역할별 분기: 첫 번째 인자가 'web' 또는 'worker'
ROLE="${1:-web}"

if [ "$ROLE" = "web" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput || true
  exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3
elif [ "$ROLE" = "worker" ]; then
  exec celery -A config worker --loglevel=info --concurrency=4
else
  exec "$@"
fi

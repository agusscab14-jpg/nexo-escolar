#!/bin/sh
set -eu
python manage.py migrate --database=migrations --noinput
python manage.py collectstatic --noinput
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers "${GUNICORN_WORKERS:-3}" --timeout 60 --access-logfile - --error-logfile -

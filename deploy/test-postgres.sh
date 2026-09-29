#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
project="nexo-pg-check-$$"
dump_file=$(mktemp "${TMPDIR:-/tmp}/nexo-restore-check.XXXXXX")
export COMPOSE_PROJECT_NAME="$project"
export COMPOSE_FILE="$root/docker-compose.test.yml"

cleanup() {
  docker compose down --rmi local --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$dump_file"
}
trap cleanup EXIT INT TERM

cd "$root"
docker compose up -d --wait db
docker compose run --rm test

docker compose run --rm --no-deps --entrypoint python test manage.py shell -c '
from core.models import AcademicPlan, Enrollment, PlanYear, School, Section, Student
school = School.objects.create(name="Restore fixture", slug="restore-fixture")
plan = AcademicPlan.objects.create(school=school, name="Plan de prueba", school_type=school.school_type, valid_from_year=2026)
year = PlanYear.objects.create(school=school, plan=plan, year_label="1° año", ordinal=1)
section = Section.objects.create(school=school, plan_year=year, academic_year=2026, division="A", shift=Section.Shift.MORNING)
student = Student.objects.create(school=school, name="Estudiante sintético")
Enrollment.objects.create(school=school, student=student, section=section, academic_year=2026)
'

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$dump_file"
RESTORE_CHECK_REQUIRE_SAMPLE_DATA=1 ./deploy/backup-restore-check.sh "$dump_file"
echo "Prueba PostgreSQL, RLS y restauración sintética completadas."

#!/bin/sh
set -eu
backup_file=${1:?Uso: deploy/backup-restore-check.sh archivo.dump}
if [ ! -f "$backup_file" ]; then
  echo "No existe la copia: $backup_file" >&2
  exit 1
fi

docker compose exec -T db pg_restore --list < "$backup_file" >/dev/null
restore_db="nexo_restore_check_$(date +%s)_$$"
cleanup() {
  docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$restore_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error' sh "$restore_db" < "$backup_file"

db_query() {
  docker compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -Atc "$2"' sh "$restore_db" "$1"
}

tables=$(db_query "SELECT count(*) = 9 FROM unnest(ARRAY['core_school','core_student','core_enrollment','core_grade','core_attendance','core_offering','core_membership','django_migrations','django_content_type']) AS t(name) WHERE to_regclass('public.' || name) IS NOT NULL")
if [ "$tables" != "t" ]; then
  echo "La restauración no contiene todas las tablas principales." >&2
  exit 1
fi

schools=$(db_query "SELECT count(*) FROM core_school")
if [ "$schools" -lt 1 ]; then
  echo "La copia restaurada no contiene ninguna escuela." >&2
  exit 1
fi

unvalidated_fks=$(db_query "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f' AND NOT c.convalidated")
if [ "$unvalidated_fks" != "0" ]; then
  echo "La restauración contiene claves foráneas sin validar: $unvalidated_fks" >&2
  exit 1
fi

rls_tables=$(db_query "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('core_student','core_attendance','core_grade') AND c.relrowsecurity AND c.relforcerowsecurity")
if [ "$rls_tables" != "3" ]; then
  echo "La restauración no conserva RLS forzada en las tablas escolares principales." >&2
  exit 1
fi

migrations=$(db_query "SELECT count(*) FROM django_migrations")
if [ "$migrations" -lt 1 ]; then
  echo "La restauración no contiene el historial de migraciones." >&2
  exit 1
fi

mismatches=$(db_query "SELECT count(*) FROM (
  SELECT e.id FROM core_enrollment e
    JOIN core_student s ON s.id=e.student_id
    JOIN core_section sec ON sec.id=e.section_id
    JOIN core_planyear py ON py.id=sec.plan_year_id
    WHERE e.school_id<>s.school_id OR e.school_id<>sec.school_id OR sec.school_id<>py.school_id
  UNION ALL
  SELECT g.id FROM core_grade g
    JOIN core_student s ON s.id=g.student_id
    JOIN core_offering o ON o.id=g.offering_id
    JOIN core_academicperiod p ON p.id=g.period_id
    WHERE g.school_id<>s.school_id OR g.school_id<>o.school_id OR g.school_id<>p.school_id
  UNION ALL
  SELECT a.id FROM core_attendance a
    JOIN core_student s ON s.id=a.student_id
    WHERE a.school_id<>s.school_id
  UNION ALL
  SELECT a.id FROM core_attendance a
    JOIN core_offering o ON o.id=a.offering_id
    WHERE a.offering_id IS NOT NULL AND a.school_id<>o.school_id
  UNION ALL
  SELECT o.id FROM core_offering o
    JOIN core_section sec ON sec.id=o.section_id
    JOIN core_subject sub ON sub.id=o.subject_id
    WHERE o.school_id<>sec.school_id OR o.school_id<>sub.school_id
  UNION ALL
  SELECT t.id FROM core_teacherassignment t
    JOIN core_offering o ON o.id=t.offering_id
    JOIN core_membership m ON m.id=t.membership_id
    WHERE t.school_id<>o.school_id OR t.school_id<>m.school_id
  UNION ALL
  SELECT l.id FROM core_loan l
    JOIN core_book b ON b.id=l.book_id
    JOIN core_student s ON s.id=l.student_id
    WHERE l.school_id<>b.school_id OR l.school_id<>s.school_id
  UNION ALL
  SELECT c.id FROM core_claim c
    JOIN core_lostitem i ON i.id=c.item_id
    JOIN core_student s ON s.id=c.student_id
    WHERE c.school_id<>i.school_id OR c.school_id<>s.school_id
  UNION ALL
  SELECT g.id FROM core_studentguardian g
    JOIN core_student s ON s.id=g.student_id
    WHERE g.school_id<>s.school_id
) AS inconsistent")
if [ "$mismatches" != "0" ]; then
  echo "La restauración contiene relaciones entre escuelas inconsistentes: $mismatches" >&2
  exit 1
fi

students=$(db_query "SELECT count(*) FROM core_student")
enrollments=$(db_query "SELECT count(*) FROM core_enrollment")
if [ "${RESTORE_CHECK_REQUIRE_SAMPLE_DATA:-0}" = "1" ] && [ "$enrollments" -lt 1 ]; then
  echo "El simulacro no restauró sus registros escolares sintéticos." >&2
  exit 1
fi

echo "Restauración verificada: escuelas=$schools alumnos=$students inscripciones=$enrollments; claves foráneas, historial y RLS correctos."

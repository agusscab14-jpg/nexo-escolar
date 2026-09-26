#!/bin/sh
set -eu
backup_file=${1:?Uso: deploy/backup-restore-check.sh archivo.dump}
if [ ! -f "$backup_file" ]; then
  echo "No existe la copia: $backup_file" >&2
  exit 1
fi
restore_db="nexo_restore_check_$(date +%s)"
cleanup() {
  docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$restore_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
docker compose exec -T db pg_restore -U "${POSTGRES_USER:-nexo_owner}" -d "$restore_db" --no-owner < "$backup_file"
exists=$(docker compose exec -T db psql -U "${POSTGRES_USER:-nexo_owner}" -d "$restore_db" -Atc "SELECT to_regclass('public.core_school') IS NOT NULL")
if [ "$exists" != "t" ]; then
  echo "La restauración no contiene la tabla de escuelas." >&2
  exit 1
fi
echo "Restauración verificada en $restore_db. La base temporal se eliminará al salir."

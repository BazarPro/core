#!/bin/bash
# Restores a backup of scripts/backup.sh into the running stack of docker-compose.yml:
#   ./scripts/restore.sh bazarpro_<date>.dump [files_<date>.tar.gz]
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Verwendung: ./scripts/restore.sh <bazarpro_….dump> [files_….tar.gz]"
  echo "Verfügbare Backups in ./backups:"
  ls -1 ./backups
  exit 1
fi
DUMP=$1
FILES=${2:-}

for file in "$DUMP" $FILES; do
  if [ ! -f "./backups/$file" ]; then
    echo "Fehler: ./backups/$file existiert nicht."
    exit 1
  fi
done

echo "⚠️  ACHTUNG: Dies überschreibt die aktuelle Datenbank mit dem Stand von $DUMP."
read -p "Bist du sicher? (j/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Jj]$ ]]; then
  echo "Abbruch."
  exit 1
fi

# The backend must not write while the data is replaced
docker compose stop backend
docker compose exec -T backup pg_restore --clean --if-exists --no-owner --dbname=bazarpro "/backups/$DUMP"
if [ -n "$FILES" ]; then
  docker compose run --rm --no-deps -v "$PWD/backups:/backups:ro" --entrypoint sh backend \
    -c "find /data/files -mindepth 1 -delete && tar -xzf /backups/$FILES -C /data/files"
fi
docker compose start backend
echo "✅ Wiederherstellung abgeschlossen."

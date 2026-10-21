#!/bin/sh
# Nightly backup (backup service of docker-compose.yml): a dump of the database and an
# archive of the uploaded files, deleted after 7 days. Connection via PGHOST, PGUSER,
# PGPASSWORD and PGDATABASE.
set -eu

BACKUP_DIR="/backups"
FILES_DIR="/data/files"
RETENTION_DAYS=7
DATE=$(date +"%Y-%m-%d_%H-%M-%S")

log() {
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1"
}

log "Sichere die Datenbank ..."
pg_dump --format=custom --file="$BACKUP_DIR/bazarpro_$DATE.dump"
log "Sichere die hochgeladenen Dateien ..."
tar -czf "$BACKUP_DIR/files_$DATE.tar.gz" -C "$FILES_DIR" .
log "Backup erfolgreich: bazarpro_$DATE.dump, files_$DATE.tar.gz"

find "$BACKUP_DIR" \( -name "bazarpro_*.dump" -o -name "files_*.tar.gz" \) -mtime +$RETENTION_DAYS -exec rm {} \;
log "Backups älter als $RETENTION_DAYS Tage gelöscht."

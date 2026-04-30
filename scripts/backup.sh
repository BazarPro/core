#!/bin/sh

BACKUP_DIR="/backups"
APP_DIR="/app"

# Zeitstempel für den Dateinamen
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="convex_export_$DATE.zip"
BACKUP_PATH="$BACKUP_DIR/$FILENAME"

cd "$APP_DIR" || exit 1

# Ensure minimal package.json and local convex dependency exist
if [ ! -f "$APP_DIR/package.json" ]; then
  cat > "$APP_DIR/package.json" <<'EOF'
{"name":"convex-backup","private":true,"dependencies":{"convex":"*"}}
EOF
fi

if [ ! -d "$APP_DIR/node_modules/convex" ]; then
  npm install --omit=dev
fi

echo "[$(date +"%Y-%m-%d %H:%M:%S")] Starte offiziellen Convex Export..."
npx convex export --include-file-storage --path "$BACKUP_PATH"

if [ $? -eq 0 ]; then
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] Backup erfolgreich: $FILENAME"
else
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] FEHLER beim Erstellen des Backups!"
    exit 1
fi

# Aufbewahrungsrichtlinie: Lösche Backups, die älter als 7 Tage sind
RETENTION_DAYS=7
echo "Lösche Backups, die älter als $RETENTION_DAYS Tage sind..."
find "$BACKUP_DIR" -name "convex_export_*.zip" -mtime +$RETENTION_DAYS -exec rm {} \;

echo "[$(date +"%Y-%m-%d %H:%M:%S")] Backup-Prozess abgeschlossen."

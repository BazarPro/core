#!/bin/bash
set -euo pipefail

# Load environment from .env if present
if [ -f "./.env" ]; then
  set -a
  . "./.env"
  set +a
fi

if [ -z "${CONVEX_DEPLOYMENT:-}" ] && [ -z "${CONVEX_SELF_HOSTED_URL:-}" ]; then
  echo "Fehler: Keine Ziel-Umgebung gefunden."
  echo "Bitte setze CONVEX_DEPLOYMENT (dev) oder CONVEX_SELF_HOSTED_URL (self-hosted) in .env."
  exit 1
fi

if [ -n "${CONVEX_DEPLOYMENT:-}" ] && [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "Fehler: CONVEX_DEPLOY_KEY fehlt."
  echo "Für Convex Cloud Restore wird ein Deploy Key benötigt (in .env setzen)."
  exit 1
fi

# Safety guard: prevent accidental prod restore
if [ -n "${CONVEX_SELF_HOSTED_URL:-}" ] || { [ -n "${CONVEX_DEPLOYMENT:-}" ] && [[ "${CONVEX_DEPLOYMENT}" != dev:* ]]; }; then
  if [ "${ALLOW_PROD_RESTORE:-}" != "yes" ]; then
    echo "Sicherheitsstopp: Restore in Nicht-Dev-Umgebung ist blockiert."
    echo "Wenn du wirklich Prod wiederherstellen willst, setze ALLOW_PROD_RESTORE=yes in .env."
    exit 1
  fi
fi

# Prüfen, ob eine Datei als Argument übergeben wurde
if [ -z "$1" ]; then
  echo "Fehler: Bitte gib den Namen der Backup-Datei an."
  echo "Verwendung: ./restore.sh <dateiname.zip>"
  echo "Verfügbare Backups im Ordner ./backups:"
  ls -1 ./backups
  exit 1
fi

BACKUP_FILE=$1

# Prüfen, ob die Datei im Backups-Ordner existiert
if [ ! -f "./backups/$BACKUP_FILE" ]; then
    echo "Fehler: Die Datei ./backups/$BACKUP_FILE existiert nicht."
    exit 1
fi

echo "⚠️  ACHTUNG: Dies überschreibt die aktuelle Datenbank mit dem Stand von $BACKUP_FILE."
read -p "Bist du sicher? (j/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Jj]$ ]]
then
    echo "Abbruch."
    exit 1
fi

echo "Starte Wiederherstellung von $BACKUP_FILE..."

docker compose exec -T backup sh -lc "
  cd /app || exit 1
  if [ ! -f /app/package.json ]; then
    cat > /app/package.json <<'EOF'
{\"name\":\"convex-backup\",\"private\":true,\"dependencies\":{\"convex\":\"*\"}}
EOF
  fi
  if [ ! -d /app/node_modules/convex ]; then
    npm install --omit=dev
  fi
  npx convex import --replace-all --yes \"/backups/$BACKUP_FILE\"
"

if [ $? -eq 0 ]; then
    echo "✅ Wiederherstellung erfolgreich abgeschlossen!"
else
    echo "❌ FEHLER bei der Wiederherstellung."
fi

#!/usr/bin/env bash
# Respaldo local de SESIM: base de datos, roles y archivos de evidencias.
# Provisional: la copia fuera del servidor se agrega cuando haya destino.
set -euo pipefail
DEST="${RESPALDO_DIR:-$HOME/respaldos}"
RET_DIAS="${RESPALDO_RETENCION_DIAS:-30}"
F="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEST"; chmod 700 "$DEST"

docker exec supabase-db pg_dump -U postgres -d postgres --no-owner | gzip > "$DEST/db_$F.sql.gz.tmp"
docker exec supabase-db pg_dumpall -U postgres --globals-only | gzip > "$DEST/roles_$F.sql.gz.tmp"
docker exec supabase-storage tar czf - -C /var/lib storage > "$DEST/archivos_$F.tar.gz.tmp"

for t in "$DEST"/*_"$F".*.tmp; do mv "$t" "${t%.tmp}"; done
chmod 600 "$DEST"/*_"$F".*
find "$DEST" -type f \( -name 'db_*' -o -name 'roles_*' -o -name 'archivos_*' \) -mtime +"$RET_DIAS" -delete
echo "$(date -Is) ok db_$F $(du -h "$DEST/db_$F.sql.gz" | cut -f1) archivos_$F $(du -h "$DEST/archivos_$F.tar.gz" | cut -f1)" >> "$DEST/respaldo.log"

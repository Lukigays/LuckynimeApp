#!/usr/bin/env bash
# Terapkan seluruh migrasi Luckynime ke database Supabase (dijalankan SEKALI untuk setup awal).
# Prasyarat: psql terinstal (PostgreSQL client) + password database.
# Ambil URL di: Supabase Dashboard → Project Settings → Database → Connection string (URI).
# USAGE: ./scripts/apply-luckynime-migrations.sh 'postgresql://postgres:PASSWORD@db.xtizaozzbworegooxeya.supabase.co:5432/postgres'
set -euo pipefail
DB_URL="${1:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ]; then
  echo "Usage: $0 'postgresql://postgres:PASSWORD@db.<project-ref>.supabase.co:5432/postgres'" >&2
  exit 1
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../supabase/migrations" && pwd)"
count=0
for f in $(ls "$DIR"/*.sql | LC_ALL=C sort); do
  echo "→ $(basename "$f")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  count=$((count+1))
done
echo "✅ $count migrasi Luckynime selesai diterapkan (project luckyproject)."

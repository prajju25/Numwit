#!/bin/sh
# Release step (fly.toml [deploy] release_command) — runs once per deploy,
# before the new version starts taking traffic.
#
# Applies pending Prisma migrations. Neon's pooled URL (DATABASE_URL, used by
# the running app) doesn't work reliably for migrations, so DIRECT_URL (Neon's
# non-pooled URL) is used when set. Without a database, there is nothing to do.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set - running without persistence, skipping migrations"
  exit 0
fi

DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy

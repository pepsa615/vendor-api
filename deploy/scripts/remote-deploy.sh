#!/usr/bin/env bash
set -euo pipefail

deploy_root="${PEPSA_DEPLOY_ROOT:-${HOME}/var/www/vendor-server}"
cd "$deploy_root"

test -d .git || {
  echo "ERROR: $deploy_root is not a git clone. Clone the vendor-api repo there first." >&2
  exit 1
}
test -f shared/.env || {
  echo "ERROR: missing $deploy_root/shared/.env" >&2
  exit 1
}

mkdir -p shared logs
ln -sfn shared/.env .env

set -a
# shellcheck source=/dev/null
source "$deploy_root/shared/.env"
set +a

# shellcheck source=/dev/null
source "$deploy_root/deploy/scripts/bootstrap-node.sh"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"
export PEPSA_PM2_ENV="${PEPSA_PM2_ENV:-production}"
if [[ -z "${PORT:-}" ]]; then
  if [[ "$PEPSA_PM2_ENV" == "staging" ]]; then
    export PORT=3600
  else
    export PORT=3610
  fi
fi

pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm build
pnpm prisma:deploy

pm2 startOrReload ecosystem.config.cjs --update-env

bash deploy/scripts/wait-for-http.sh "http://127.0.0.1:${PORT}/api/v1/health/live"

pm2 save
echo "Vendor backend deployed at $(git rev-parse --short HEAD) (PEPSA_PM2_ENV=${PEPSA_PM2_ENV}, PORT=${PORT})"

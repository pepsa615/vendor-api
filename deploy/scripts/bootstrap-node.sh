#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin:${PATH}"

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "${HOME}/.nvm/nvm.sh"
fi

command -v node >/dev/null 2>&1 || {
  echo 'ERROR: node is not installed or is not on PATH' >&2
  exit 1
}

if ! command -v pnpm >/dev/null 2>&1; then
  command -v corepack >/dev/null 2>&1 || {
    echo 'ERROR: pnpm and corepack are unavailable' >&2
    exit 1
  }
  corepack enable
  corepack prepare pnpm@12.4.2 --activate
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install --global pm2
fi

echo "Using node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

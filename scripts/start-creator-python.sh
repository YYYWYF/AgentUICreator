#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
PYTHON_ROOT="${WORKSPACE_ROOT}/packages/creator-python"
ENV_FILE="${WORKSPACE_ROOT}/.env.creator.local"
PYTHON_BIN="${PYTHON_ROOT}/.venv/bin/python"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${CREATOR_PYTHON_AUTH_TOKEN:?CREATOR_PYTHON_AUTH_TOKEN is missing from .env.creator.local}"

ENDPOINT="${CREATOR_PYTHON_ENDPOINT:-http://127.0.0.1:8010}"
if [[ "${ENDPOINT}" != http://127.0.0.1:* ]]; then
  echo "CREATOR_PYTHON_ENDPOINT must use http://127.0.0.1:<port>." >&2
  exit 1
fi

PORT="${ENDPOINT##*:}"
if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "CREATOR_PYTHON_ENDPOINT must include a valid port." >&2
  exit 1
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Missing managed Python runtime: ${PYTHON_BIN}" >&2
  echo "Run: pnpm test:python:setup" >&2
  exit 1
fi

cd "${PYTHON_ROOT}"
SERVER_ARGS=(
  -m agent_ui_creator.server
  --project-root "${WORKSPACE_ROOT}/examples/agent-frontend"
  --skills-root "${WORKSPACE_ROOT}/packages/creator/skills"
  --config-root "${WORKSPACE_ROOT}"
  --port "${PORT}"
  --auth-token "${CREATOR_PYTHON_AUTH_TOKEN}"
)

if [[ "${CREATOR_PYTHON_HOT_RELOAD:-0}" == "1" ]]; then
  exec "${PYTHON_BIN}" "${PYTHON_ROOT}/dev_reload.py" \
    --source-root "${PYTHON_ROOT}/agent_ui_creator" \
    -- "${PYTHON_BIN}" "${SERVER_ARGS[@]}"
fi

exec "${PYTHON_BIN}" "${SERVER_ARGS[@]}"

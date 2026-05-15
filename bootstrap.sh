#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if command -v uv >/dev/null 2>&1; then
  uv venv .venv
  uv pip install -r requirements.txt --python .venv/bin/python
  echo "Bootstrap complete with uv."
  echo "Next:"
  echo "  source .venv/bin/activate"
  echo "  python app.py"
  exit 0
fi

if python3 -m venv .venv >/dev/null 2>&1; then
  source .venv/bin/activate
  python -m pip install -r requirements.txt
  echo "Bootstrap complete with python3 -m venv."
  echo "Next:"
  echo "  source .venv/bin/activate"
  echo "  python app.py"
  exit 0
fi

echo "Failed to create a virtual environment."
echo "Install uv, or install python3.12-venv and retry."
exit 1

#!/usr/bin/env bash
# Install the `crm` admin CLI into PATH (symlink, not a copy).
#
#   ./scripts/install-cli.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/scripts/crm"

if [[ ! -f "$SRC" ]]; then
  echo "Нет файла $SRC" >&2
  exit 1
fi
chmod +x "$SRC" "$ROOT/scripts/"*.sh 2>/dev/null || true

install_link() {
  local dest="$1"
  local dir
  dir="$(dirname "$dest")"
  mkdir -p "$dir"
  ln -sfn "$SRC" "$dest"
  echo "CLI: $dest → $SRC"
}

if [[ "$(id -u)" -eq 0 ]] || [[ -w /usr/local/bin ]]; then
  install_link /usr/local/bin/crm
elif [[ -w "${HOME}/.local/bin" ]] || mkdir -p "${HOME}/.local/bin" 2>/dev/null; then
  install_link "${HOME}/.local/bin/crm"
  case ":$PATH:" in
    *":${HOME}/.local/bin:"*) ;;
    *)
      echo "Добавьте в PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
      ;;
  esac
else
  echo "Не удалось записать ни /usr/local/bin, ни ~/.local/bin." >&2
  echo "Запустите от root или вызывайте: $SRC" >&2
  exit 1
fi

echo "Команда:  crm"
echo "Справка:  crm help"

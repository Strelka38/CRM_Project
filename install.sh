#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Не найден Docker. Установите и повторите:

  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker

EOF
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Docker установлен, но демон не запущен или нет прав.

  systemctl start docker
  # либо добавьте пользователя в группу docker и перелогиньтесь:
  # usermod -aG docker "$USER"

EOF
  exit 1
fi

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    return 0
  fi

  echo "==> Docker Compose не найден — скачиваю бинарник..."
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *)
      echo "Неподдерживаемая архитектура: $arch" >&2
      exit 1
      ;;
  esac

  local plugin_dir="/usr/local/lib/docker/cli-plugins"
  local url="https://github.com/docker/compose/releases/download/v2.36.2/docker-compose-linux-${arch}"
  mkdir -p "$plugin_dir"
  if ! curl -fsSL "$url" -o "${plugin_dir}/docker-compose"; then
    cat >&2 <<'EOF'
Не удалось скачать Docker Compose. Установите Docker с официального репозитория:

  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker

EOF
    exit 1
  fi
  chmod +x "${plugin_dir}/docker-compose"

  # Fallback path for older docker CLI layouts
  if ! docker compose version >/dev/null 2>&1; then
    ln -sf "${plugin_dir}/docker-compose" /usr/local/bin/docker-compose
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "Compose установлен, но docker его не видит. Проверьте: docker compose version" >&2
    exit 1
  fi
  echo "    OK: $("${COMPOSE[@]}" version)"
}

ensure_compose

echo "=========================================="
echo "  Установка Event Rental CRM"
echo "=========================================="
echo
echo "Порты 80 и 443 должны быть свободны."
echo "Домен должен указывать A/AAAA-записью на этот сервер"
echo "(для выпуска Let's Encrypt сертификата)."
echo

read -r -p "Домен (например crm.example.com): " DOMAIN
DOMAIN="$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -z "$DOMAIN" ]]; then
  echo "Домен обязателен." >&2
  exit 1
fi
if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then
  echo "Некорректный домен: $DOMAIN" >&2
  exit 1
fi

read -r -p "Email администратора: " ADMIN_EMAIL
ADMIN_EMAIL="$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ -z "$ADMIN_EMAIL" || "$ADMIN_EMAIL" != *"@"* ]]; then
  echo "Укажите корректный email." >&2
  exit 1
fi

while true; do
  read -r -s -p "Пароль администратора: " ADMIN_PASSWORD
  echo
  read -r -s -p "Повторите пароль: " ADMIN_PASSWORD2
  echo
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    echo "Пароль не может быть пустым."
    continue
  fi
  if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD2" ]]; then
    echo "Пароли не совпадают."
    continue
  fi
  if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
    echo "Пароль должен быть не короче 8 символов."
    continue
  fi
  break
done

read -r -p "Имя администратора [Администратор]: " ADMIN_NAME
ADMIN_NAME="$(echo "${ADMIN_NAME:-Администратор}" | xargs)"

AUTH_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"
POSTGRES_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

# Escape values for .env (double-quoted). $$ → $ for Docker Compose.
env_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/$$/g'
}

cat > "$ROOT/.env" <<EOF
DOMAIN="$(env_escape "$DOMAIN")"
POSTGRES_USER="crm"
POSTGRES_PASSWORD="$(env_escape "$POSTGRES_PASSWORD")"
POSTGRES_DB="crm_event"
DATABASE_URL="postgresql://crm:$(env_escape "$POSTGRES_PASSWORD")@db:5432/crm_event?schema=public"
AUTH_SECRET="$(env_escape "$AUTH_SECRET")"
AUTH_URL="https://$(env_escape "$DOMAIN")"
BOOTSTRAP_MODE="prod"
BOOTSTRAP_MANAGER_EMAIL="$(env_escape "$ADMIN_EMAIL")"
BOOTSTRAP_MANAGER_PASSWORD="$(env_escape "$ADMIN_PASSWORD")"
BOOTSTRAP_MANAGER_NAME="$(env_escape "$ADMIN_NAME")"
EOF

echo
echo "==> Собираю и запускаю контейнеры..."
"${COMPOSE[@]}" up -d --build

echo
echo "=========================================="
echo "  Готово"
echo "=========================================="
echo "Сайт:     https://${DOMAIN}"
echo "Логин:    ${ADMIN_EMAIL}"
echo
echo "Сертификат выпускает Caddy (Let's Encrypt)."
echo "Если HTTPS ещё не открывается — подождите минуту"
echo "и проверьте, что домен указывает на этот сервер."
echo
echo "Управление:"
echo "  ${COMPOSE[*]} ps"
echo "  ${COMPOSE[*]} logs -f app"
echo "  ${COMPOSE[*]} down"
echo

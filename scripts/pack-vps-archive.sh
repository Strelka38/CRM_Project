#!/usr/bin/env bash
# Pack a ready-to-SFTP deploy archive: prebuilt linux/amd64 image + compose/install.
# Usage (from repo root, after image is built):
#   ./scripts/pack-vps-archive.sh
#   IMAGE_TAR=crm-app.tar.gz ./scripts/pack-vps-archive.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d-%H%M)"
OUT_DIR="${OUT_DIR:-$ROOT/dist}"
STAGE="$OUT_DIR/bsg-crm-vps-$STAMP"
ARCHIVE="$OUT_DIR/bsg-crm-vps-$STAMP.tar.gz"
IMAGE_TAR="${IMAGE_TAR:-$ROOT/crm-app.tar.gz}"

if [[ ! -f "$IMAGE_TAR" ]]; then
  echo "Нет образа: $IMAGE_TAR" >&2
  echo "Сначала: DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t crm-app:latest -f Dockerfile ." >&2
  echo "Потом:   docker save crm-app:latest | gzip -1 > crm-app.tar.gz" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"

echo "==> Копирую файлы деплоя в $STAGE"
cp -a \
  docker-compose.yml \
  Dockerfile \
  install.sh \
  "$STAGE/"

mkdir -p "$STAGE/docker" "$STAGE/scripts"
cp -a docker/Caddyfile docker/entrypoint.sh "$STAGE/docker/"
cp -a \
  scripts/lib.sh \
  scripts/backup.sh \
  scripts/backup-cron.sh \
  scripts/restore.sh \
  scripts/migrate-volumes-to-data.sh \
  scripts/fix-prod-db-columns.sh \
  "$STAGE/scripts/"

# Prebuilt image (rename to stable name inside archive)
cp -a "$IMAGE_TAR" "$STAGE/crm-app.tar.gz"

# Deploy helper: load image + interactive .env + up without rebuild
cat > "$STAGE/deploy.sh" <<'EOF'
#!/usr/bin/env bash
# Развёртывание с предсобранного образа (без сборки на VPS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOT'
Не найден Docker. Установите и повторите:

  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker

EOT
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'EOT'
Docker установлен, но демон не запущен или нет прав.

  systemctl start docker
  # usermod -aG docker "$USER"  &&  перелогиньтесь

EOT
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
  echo "Docker Compose не найден." >&2
  exit 1
}

ensure_compose

echo "=========================================="
echo "  Развёртывание BaikalStage CRM (образ)"
echo "=========================================="
echo
echo "Порты 80 и 443 должны быть свободны."
echo "Домен должен указывать A/AAAA на этот сервер."
echo

if [[ ! -f "$ROOT/crm-app.tar.gz" ]]; then
  echo "Нет файла crm-app.tar.gz рядом с deploy.sh" >&2
  exit 1
fi

echo "==> Загружаю Docker-образ crm-app:latest..."
gunzip -c "$ROOT/crm-app.tar.gz" | docker load

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

env_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/$$/g'
}

cat > "$ROOT/.env" <<ENVEOF
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
ENVEOF

echo
echo "==> Каталоги данных: data/postgres, data/uploads, backups"
mkdir -p "$ROOT/data/postgres" "$ROOT/data/uploads" "$ROOT/backups"

echo
echo "==> Запускаю контейнеры (без пересборки)..."
"${COMPOSE[@]}" up -d

echo
echo "=========================================="
echo "  Готово"
echo "=========================================="
echo "Сайт:     https://${DOMAIN}"
echo "Логин:    ${ADMIN_EMAIL}"
echo
echo "Сертификат выпускает Caddy (Let's Encrypt)."
echo "Данные:   ./data/postgres  ./data/uploads"
echo "Снимки:   ./backups        (./scripts/backup.sh)"
echo
echo "Управление:"
echo "  ${COMPOSE[*]} ps"
echo "  ${COMPOSE[*]} logs -f app"
echo "  ${COMPOSE[*]} down"
echo
EOF
chmod +x "$STAGE/deploy.sh" "$STAGE/install.sh" "$STAGE/scripts/"*.sh

cat > "$STAGE/КАК_РАЗВЕРНУТЬ.txt" <<EOF
BaikalStage CRM — архив для VPS (образ linux/amd64)
====================================================

1) На VPS нужны Docker и свободные порты 80/443.
   Домен (A/AAAA) должен указывать на IP сервера.

2) Залейте этот каталог по SFTP, например в /var/www/bsg-crm
   (или распакуйте .tar.gz на сервере).

3) На сервере:

   cd /var/www/bsg-crm
   chmod +x deploy.sh install.sh scripts/*.sh
   ./deploy.sh

   Скрипт загрузит образ crm-app:latest, спросит домен и
   данные админа, создаст .env и запустит docker compose.

4) Откройте https://ВАШ_ДОМЕН и войдите под созданным админом.
   Каталог в prod пустой — импортируйте CSV/JSON из «База данных».

Альтернатива (сборка на сервере, медленно на слабом VPS):
   ./install.sh

Обновление образа позже:
   gunzip -c crm-app.tar.gz | docker load
   docker compose up -d

Снимки БД+файлов: ./scripts/backup.sh / ./scripts/restore.sh
EOF

echo "==> Упаковываю $ARCHIVE"
mkdir -p "$OUT_DIR"
tar -C "$OUT_DIR" -czf "$ARCHIVE" "bsg-crm-vps-$STAMP"

# Also leave an unpacked folder for direct SFTP of the directory
ls -lh "$ARCHIVE" "$STAGE/crm-app.tar.gz"
echo
echo "Готово:"
echo "  Архив:  $ARCHIVE"
echo "  Папка:  $STAGE"
echo
echo "Залейте по SFTP архив или содержимое папки, на VPS:"
echo "  tar -xzf bsg-crm-vps-*.tar.gz && cd bsg-crm-vps-* && ./deploy.sh"

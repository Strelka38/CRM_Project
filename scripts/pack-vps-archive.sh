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
  FALLBACK="$(ls -t "$ROOT"/dist/bsg-crm-vps-*/crm-app.tar.gz 2>/dev/null | head -1 || true)"
  if [[ -n "${FALLBACK:-}" && -f "$FALLBACK" ]]; then
    IMAGE_TAR="$FALLBACK"
    echo "Образ в корне не найден — беру $IMAGE_TAR"
  else
    echo "Нет образа: $IMAGE_TAR" >&2
    echo "Сначала: DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t crm-app:latest -f Dockerfile ." >&2
    echo "Потом:   docker save crm-app:latest | gzip -1 > crm-app.tar.gz" >&2
    exit 1
  fi
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"

echo "==> Копирую файлы деплоя в $STAGE"
cp -a \
  docker-compose.yml \
  docker-compose.remote-db.yml \
  Dockerfile \
  install.sh \
  "$STAGE/"

mkdir -p "$STAGE/docker" "$STAGE/scripts"
cp -a docker/Caddyfile docker/entrypoint.sh docker/db-only-compose.yml "$STAGE/docker/"
cp -a \
  scripts/lib.sh \
  scripts/backup.sh \
  scripts/backup-cron.sh \
  scripts/restore.sh \
  scripts/migrate-volumes-to-data.sh \
  scripts/migrate-server.sh \
  scripts/migrate-db.sh \
  scripts/install-cli.sh \
  scripts/crm \
  scripts/fix-prod-db-columns.sh \
  scripts/rescue-named-volumes.sh \
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

if [[ -f "$ROOT/.env" ]]; then
  echo "Найден .env — CRM уже установлена." >&2
  echo "Для обновления запустите: ./update.sh" >&2
  echo "deploy.sh создаёт новый .env и не должен запускаться поверх рабочей базы." >&2
  exit 1
fi

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

if [[ -x "$ROOT/scripts/install-cli.sh" ]]; then
  echo
  echo "==> Админ-CLI"
  "$ROOT/scripts/install-cli.sh" || true
fi

echo
echo "=========================================="
echo "  Готово"
echo "=========================================="
echo "Сайт:     https://${DOMAIN}"
echo "Логин:    ${ADMIN_EMAIL}"
echo
echo "Сертификат выпускает Caddy (Let's Encrypt)."
echo "Данные:   ./data/postgres  ./data/uploads"
echo "Снимки:   ./backups        (команда crm snapshot)"
echo
echo "Админка в терминале:"
echo "  crm                 меню"
echo "  crm snapshot        полный снимок"
echo "  crm migrate         переезд CRM на другой VPS"
echo "  crm migrate-db      вынести Postgres на другой VPS"
echo "  crm admin           почта и пароль суперадмина"
echo
echo "Управление:"
echo "  ${COMPOSE[*]} ps"
echo "  ${COMPOSE[*]} logs -f app"
echo "  ${COMPOSE[*]} down"
echo
EOF

# Update helper: load image + refresh compose/scripts, keep .env and data
cat > "$STAGE/update.sh" <<'EOF'
#!/usr/bin/env bash
# Обновление уже стоящей CRM с предсобранного образа.
# Не трогает .env, data/postgres, data/uploads, backups/.
#
#   cd /var/www/bsg-crm && ./update.sh          # архив распакован в каталог установки
#   ./update.sh /var/www/bsg-crm                # архив распакован отдельно
#   ./update.sh --skip-backup /var/www/bsg-crm
set -euo pipefail

PACK="$(cd "$(dirname "$0")" && pwd)"

SKIP_BACKUP=0
INSTALL=""
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --help|-h)
      echo "Usage: $0 [--skip-backup] [INSTALL_DIR]"
      exit 0
      ;;
    *)
      if [[ -n "$INSTALL" ]]; then
        echo "Лишний аргумент: $arg" >&2
        exit 1
      fi
      INSTALL="$arg"
      ;;
  esac
done

if [[ -z "$INSTALL" ]]; then
  if [[ -f "$PACK/.env" ]]; then
    INSTALL="$PACK"
  elif [[ -f /var/www/bsg-crm/.env ]]; then
    INSTALL="/var/www/bsg-crm"
  else
    echo "Не найден установленный инстанс (.env)." >&2
    echo "Укажите каталог: $0 /var/www/bsg-crm" >&2
    echo "Первая установка: ./deploy.sh" >&2
    exit 1
  fi
fi

if [[ ! -d "$INSTALL" ]]; then
  echo "Нет каталога: $INSTALL" >&2
  exit 1
fi
INSTALL="$(cd "$INSTALL" && pwd)"

if [[ ! -f "$INSTALL/.env" ]]; then
  echo "В $INSTALL нет .env — это не рабочая установка." >&2
  echo "Первая установка: ./deploy.sh" >&2
  exit 1
fi

if [[ ! -f "$PACK/crm-app.tar.gz" ]]; then
  echo "Нет файла $PACK/crm-app.tar.gz" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Не найден Docker." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker не запущен или нет прав." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose не найден." >&2
  exit 1
fi

echo "=========================================="
echo "  Обновление BaikalStage CRM"
echo "=========================================="
echo "Пакет:      $PACK"
echo "Установка:  $INSTALL"
echo "Данные:     $INSTALL/data   (не трогаем)"
echo ".env:       $INSTALL/.env   (не трогаем)"
echo

if [[ "$SKIP_BACKUP" -eq 0 && -x "$INSTALL/scripts/backup.sh" ]]; then
  echo "==> Снимок перед обновлением..."
  if (cd "$INSTALL" && ./scripts/backup.sh); then
    echo "    OK"
  else
    echo "Снимок не удался. Исправьте или повторите с --skip-backup." >&2
    exit 1
  fi
  echo
elif [[ "$SKIP_BACKUP" -eq 1 ]]; then
  echo "==> Снимок пропущен (--skip-backup)"
  echo
fi

if [[ "$PACK" != "$INSTALL" ]]; then
  echo "==> Копирую Caddy и скрипты (compose НЕ трогаю — иначе слетят тома pgdata)"
  mkdir -p "$INSTALL/docker" "$INSTALL/scripts"
  [[ -f "$PACK/docker/Caddyfile" ]] && cp -a "$PACK/docker/Caddyfile" "$INSTALL/docker/"
  [[ -f "$PACK/docker/entrypoint.sh" ]] && cp -a "$PACK/docker/entrypoint.sh" "$INSTALL/docker/"
  [[ -f "$PACK/docker/db-only-compose.yml" ]] && cp -a "$PACK/docker/db-only-compose.yml" "$INSTALL/docker/"
  [[ -f "$PACK/docker-compose.remote-db.yml" ]] && cp -a "$PACK/docker-compose.remote-db.yml" "$INSTALL/docker-compose.remote-db.yml"
  cp -a "$PACK/scripts/." "$INSTALL/scripts/"
  cp -a "$PACK/update.sh" "$INSTALL/update.sh"
  chmod +x "$INSTALL/update.sh" "$INSTALL/scripts/"*.sh "$INSTALL/scripts/crm" 2>/dev/null || true
fi

echo "==> Загружаю Docker-образ crm-app:latest..."
gunzip -c "$PACK/crm-app.tar.gz" | docker load

echo
echo "==> Перезапускаю app (без сборки на VPS)..."
cd "$INSTALL"
"${COMPOSE[@]}" up -d --no-build --force-recreate app
"${COMPOSE[@]}" up -d --no-build

if [[ -x "$INSTALL/scripts/install-cli.sh" ]]; then
  echo
  echo "==> Админ-CLI"
  "$INSTALL/scripts/install-cli.sh" || true
fi

echo
echo "==> Статус:"
"${COMPOSE[@]}" ps

echo
echo "=========================================="
echo "  Обновление применено"
echo "=========================================="
echo "Миграции Prisma выполняются при старте контейнера app."
echo "Админка:  crm   (снимок / переезд / суперадмин)"
echo "Логи:     ${COMPOSE[*]} logs -f app"
echo
EOF

chmod +x "$STAGE/deploy.sh" "$STAGE/update.sh" "$STAGE/install.sh" "$STAGE/scripts/"*.sh "$STAGE/scripts/crm"

cat > "$STAGE/КАК_РАЗВЕРНУТЬ.txt" <<EOF
BaikalStage CRM — архив для VPS (образ linux/amd64)
====================================================

=== Обновление уже стоящей CRM ===

1) Залейте этот .tar.gz на VPS (SFTP), например в /tmp.

2) На сервере:

   cd /tmp
   tar -xzf bsg-crm-vps-*.tar.gz
   cd bsg-crm-vps-*
   chmod +x update.sh
   ./update.sh /var/www/bsg-crm

   Скрипт:
   - сделает снимок БД+файлов (если есть scripts/backup.sh)
   - загрузит образ crm-app:latest
   - обновит Caddy/скрипты
   - перезапустит контейнер app
   - НЕ трогает .env, docker-compose.yml, data/, backups/

   Если после прошлого апдейта пропали сметы/каталог — база скорее
   осталась в Docker-томе pgdata:

   cd /var/www/bsg-crm
   ./scripts/rescue-named-volumes.sh
   ./scripts/rescue-named-volumes.sh --yes

   Без снимка: ./update.sh --skip-backup /var/www/bsg-crm

3) Проверьте сайт и логи:

   cd /var/www/bsg-crm
   docker compose logs -f app

Если архив распаковали прямо в /var/www/bsg-crm (поверх файлов,
но не поверх data/ и .env):

   cd /var/www/bsg-crm
   ./update.sh

=== Первая установка (пустой VPS) ===

   cd /var/www/bsg-crm   # или распакованная папка
   chmod +x deploy.sh
   ./deploy.sh

   Спросит домен и админа, создаст .env, поднимет контейнеры.
   Не запускайте deploy.sh на уже рабочей CRM — он отказается,
   если .env уже есть.

Снимки: ./scripts/backup.sh / ./scripts/restore.sh
        или команда crm snapshot / crm restore

Админка в терминале (после deploy/update):

   crm                 меню
   crm snapshot        полный снимок БД + файлы
   crm migrate         переезд на другой VPS (IP + root)
   crm migrate-db      вынести Postgres на другой VPS
   crm admin           почта и пароль суперадмина
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
echo "Залейте архив на VPS и обновите уже стоящую CRM:"
echo "  tar -xzf bsg-crm-vps-*.tar.gz && cd bsg-crm-vps-* && ./update.sh /var/www/bsg-crm"
echo "Первая установка: ./deploy.sh"

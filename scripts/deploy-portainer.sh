#!/usr/bin/env bash
#
# Publica o estadodalei.pt no NAS através da API do Portainer, como uma stack
# (docker compose) com dois serviços: o MongoDB e a aplicação (site, API e
# sincronização automática). É o mesmo docker-compose.yml que corre no Mac.
# O MongoDB fica em 127.0.0.1:27018 do NAS (só acessível no próprio NAS).
#
# Uso:
#   pnpm run deploy                 (ou: scripts/deploy-portainer.sh)
#   CHECK_ONLY=1 pnpm run deploy    só verifica token, NAS e porta; não muda nada
#
# O que faz:
#   1. constrói a imagem estadodalei:latest no próprio NAS a partir do código e do
#      Dockerfile da raiz (como os outros sites; a arquitetura do CPU não importa);
#   2. cria a stack "estadodalei" no Portainer na primeira vez, ou atualiza-a nas
#      seguintes. Só o contentor da aplicação é recriado; o MongoDB e o volume com
#      os dados (estadodalei_mongo-data) mantêm-se.
#
# O token do Portainer vem de $PORTAINER_TOKEN ou de ~/.portainer-token.
# O endereço do Portainer e os segredos da aplicação vêm de .env.production (fora do git):
#   PORTAINER_URL=https://<ip-do-nas>:<porta>   obrigatório
# Os segredos ficam guardados como variáveis da stack no Portainer:
#   HEARTBEAT_URL=https://hc-ping.com/<uuid>   alerta por email se os dados ficarem desatualizados
#   ADMIN_TOKEN=<token longo>                  ativa POST /api/admin/sync
#
# Os sites no NAS usam as portas 20000-20099, uma por site. O público chega pelo
# proxy inverso do DSM (domínio:443 -> localhost:HOST_PORT). As regras de 80 e 443
# enviam o cabeçalho X-Forwarded-Proto: $scheme, e a aplicação redireciona
# http:// e www. para https://<domínio>.
#
# Cada definição abaixo pode ser substituída por uma variável de ambiente com o mesmo nome.

set -euo pipefail

# ── Definições do site ─────────────────────────────────────────────────────
STACK="${STACK:-estadodalei}"          # nome da stack no Portainer (= projeto docker compose)
IMAGE="${IMAGE:-estadodalei:latest}"   # tem de ser igual ao "image:" do serviço app no docker-compose.yml
HOST_PORT="${HOST_PORT:-20003}"        # porta no NAS, 20000-20099
# O DS918+ (Celeron J3455) não tem AVX, e o MongoDB 5+ não arranca sem AVX.
# A 4.4 é também a versão mínima aceite pelo driver do Mongoose 9.
MONGO_IMAGE="${MONGO_IMAGE:-mongo:4.4}"
MONGO_PORT="${MONGO_PORT:-27018}"      # a mesma porta que no Mac
# ───────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Definições locais e segredos (fora do git): PORTAINER_URL, HEARTBEAT_URL, ADMIN_TOKEN.
if [[ -f .env.production ]]; then
  set -a; source .env.production; set +a
fi

: "${PORTAINER_URL:?Define PORTAINER_URL em .env.production (ex.: PORTAINER_URL=https://<ip-do-nas>:<porta>)}"
if [[ -z "${PORTAINER_TOKEN:-}" && -r "$HOME/.portainer-token" ]]; then
  PORTAINER_TOKEN="$(<"$HOME/.portainer-token")"
fi
: "${PORTAINER_TOKEN:?Define PORTAINER_TOKEN ou guarda-o em ~/.portainer-token (Portainer → My account → Access tokens)}"
command -v jq >/dev/null || { echo "Falta o jq (brew install jq)" >&2; exit 1; }
WEBSITE_PORT_MIN=20000
WEBSITE_PORT_MAX=20099

if ! [[ "$HOST_PORT" =~ ^[0-9]+$ ]] || (( HOST_PORT < WEBSITE_PORT_MIN || HOST_PORT > WEBSITE_PORT_MAX )); then
  echo "HOST_PORT tem de estar entre ${WEBSITE_PORT_MIN} e ${WEBSITE_PORT_MAX} (recebi ${HOST_PORT})" >&2
  exit 1
fi

COMPOSE_FILE="$ROOT/docker-compose.yml"
grep -q "image: ${IMAGE}\$" "$COMPOSE_FILE" || { echo "O serviço app do docker-compose.yml não usa a imagem ${IMAGE}" >&2; exit 1; }

api() {
  # -k: o Portainer no NAS usa um certificado autoassinado.
  curl -sSk -H "X-API-Key: ${PORTAINER_TOKEN}" "$@"
}

if [[ -z "${PORTAINER_ENDPOINT_ID:-}" ]]; then
  PORTAINER_ENDPOINT_ID="$(api "${PORTAINER_URL}/api/endpoints" | jq -r 'first(.[] | select(.Type == 1 or .Type == 2) | .Id)')"
  [[ -n "$PORTAINER_ENDPOINT_ID" && "$PORTAINER_ENDPOINT_ID" != "null" ]] || { echo "Nenhum ambiente Docker encontrado no Portainer" >&2; exit 1; }
fi
DOCKER="${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker"

# Recusa portas já publicadas por outros contentores (os contentores desta stack não contam).
port_owner() {
  api "${DOCKER}/containers/json?all=1" | jq -r --argjson port "$1" --arg stack "$STACK" \
    'first(.[] | select(.Labels["com.docker.compose.project"] != $stack) | select(any(.Ports[]?; .PublicPort == $port)) | .Names[0]) // empty'
}
MONGO_OWNER="$(port_owner "$MONGO_PORT")"
if [[ -n "$MONGO_OWNER" ]]; then
  echo "A porta ${MONGO_PORT} (MongoDB) já é usada pelo contentor ${MONGO_OWNER#/}. Define outra com MONGO_PORT=..." >&2
  exit 1
fi
PORT_OWNER="$(port_owner "$HOST_PORT")"
if [[ -n "$PORT_OWNER" ]]; then
  echo "A porta ${HOST_PORT} já é usada pelo contentor ${PORT_OWNER#/}. Escolhe outra entre ${WEBSITE_PORT_MIN} e ${WEBSITE_PORT_MAX}." >&2
  echo "Portas de sites em uso: $(api "${DOCKER}/containers/json?all=1" | jq -r --argjson min "$WEBSITE_PORT_MIN" --argjson max "$WEBSITE_PORT_MAX" \
    '[.[] | .Ports[]? | .PublicPort // empty | select(. >= $min and . <= $max)] | unique | join(", ")')" >&2
  exit 1
fi

STACK_ID="$(api "${PORTAINER_URL}/api/stacks" | jq -r --arg name "$STACK" --argjson ep "$PORTAINER_ENDPOINT_ID" \
  'first(.[] | select(.Name == $name and .EndpointId == $ep) | .Id) // empty')"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ A empacotar o código"
# As mesmas exclusões do .dockerignore, para não enviar node_modules pela VPN.
# Sem atributos estendidos do macOS (ex.: com.apple.provenance): o builder do Docker
# recusa-os com "lsetxattr ... operation not supported".
TAR_NO_META=(--no-xattrs)
tar --version 2>/dev/null | grep -q bsdtar && TAR_NO_META+=(--no-mac-metadata --no-acls --no-fflags)
COPYFILE_DISABLE=1 tar -C "$ROOT" -czf "$TMP/context.tar.gz" "${TAR_NO_META[@]}" \
  --exclude=node_modules --exclude=dist --exclude=.astro --exclude=.archive \
  --exclude=.env --exclude='.env.*' --exclude='*.log' --exclude=.DS_Store --exclude=.claude \
  .
echo "  contexto de $(du -h "$TMP/context.tar.gz" | cut -f1)"

if [[ "${CHECK_ONLY:-}" == "1" ]]; then
  echo "✓ Verificação OK: Portainer acessível (ambiente ${PORTAINER_ENDPOINT_ID}), portas ${HOST_PORT} (site) e ${MONGO_PORT} (MongoDB) livres."
  echo "  Stack ${STACK}: $([[ -n "$STACK_ID" ]] && echo "existe (id ${STACK_ID}), vai ser atualizada" || echo 'ainda não existe, vai ser criada')"
  echo "  HEARTBEAT_URL $([[ -n "${HEARTBEAT_URL:-}" ]] && echo definido || echo 'não definido (sem alertas por email)')"
  exit 0
fi

echo "→ A construir a imagem ${IMAGE} no NAS (na primeira vez demora vários minutos)"
BUILD_LOG="$TMP/build.log"
api -N -X POST -H "Content-Type: application/x-tar" \
  --data-binary @"$TMP/context.tar.gz" \
  "${DOCKER}/build?t=${IMAGE}&pull=1&rm=1&forcerm=1" > "$BUILD_LOG" &
BUILD_PID=$!
while kill -0 "$BUILD_PID" 2>/dev/null; do
  sleep 10
  STEP="$(grep -o '"stream":"Step [0-9]*/[0-9]*' "$BUILD_LOG" | tail -1 | sed 's/.*Step //' || true)"
  if [[ -n "$STEP" ]]; then printf '\r  passo %s ' "$STEP"; fi
done
wait "$BUILD_PID"
echo
if grep -q '"errorDetail"' "$BUILD_LOG" || ! grep -q "Successfully tagged ${IMAGE}" "$BUILD_LOG"; then
  echo "A construção falhou. Últimas linhas:" >&2
  jq -rj '.stream // .error // empty' "$BUILD_LOG" 2>/dev/null | tail -30 >&2 || tail -c 3000 "$BUILD_LOG" >&2
  exit 1
fi
IMAGE_ID="$(api "${DOCKER}/images/${IMAGE}/json" | jq -r '.Id')"

# Variáveis da stack (interpoladas no docker-compose.yml pelo Portainer).
STACK_ENV="$(jq -n \
  --arg mongo "$MONGO_IMAGE" --arg mongoport "$MONGO_PORT" --arg port "$HOST_PORT" \
  --arg heartbeat "${HEARTBEAT_URL:-}" --arg admin "${ADMIN_TOKEN:-}" '[
  {name: "MONGO_IMAGE", value: $mongo},
  {name: "MONGO_PORT", value: $mongoport},
  {name: "SITE_PORT", value: $port},
  {name: "SITE_BIND", value: "0.0.0.0"},
  {name: "HEARTBEAT_URL", value: $heartbeat},
  {name: "ADMIN_TOKEN", value: $admin}
]')"

stack_request() { # método, URL; corpo JSON no stdin
  local res
  res="$(api -X "$1" -H "Content-Type: application/json" "$2" -d @-)"
  if ! jq -e '.Id' >/dev/null 2>&1 <<<"$res"; then
    echo "O Portainer recusou a stack: $(jq -r '.details // .message // .' <<<"$res" 2>/dev/null || echo "$res")" >&2
    exit 1
  fi
  jq -r '.Id' <<<"$res"
}

deploy_stack() {
  if [[ -z "$STACK_ID" ]]; then
    echo "→ A criar a stack ${STACK} (MongoDB ${MONGO_IMAGE} + aplicação na porta ${HOST_PORT})"
    STACK_ID="$(jq -n --arg name "$STACK" --rawfile file "$COMPOSE_FILE" --argjson env "$STACK_ENV" \
      '{name: $name, stackFileContent: $file, env: $env}' |
      stack_request POST "${PORTAINER_URL}/api/stacks/create/standalone/string?endpointId=${PORTAINER_ENDPOINT_ID}")"
  else
    echo "→ A atualizar a stack ${STACK} (id ${STACK_ID})"
    jq -n --rawfile file "$COMPOSE_FILE" --argjson env "$STACK_ENV" \
      '{stackFileContent: $file, env: $env, prune: true, pullImage: false}' |
      stack_request PUT "${PORTAINER_URL}/api/stacks/${STACK_ID}?endpointId=${PORTAINER_ENDPOINT_ID}" >/dev/null
  fi
}

app_container() { # id do contentor do serviço app desta stack
  local filters
  filters="$(jq -rn --arg p "$STACK" '{label: ["com.docker.compose.project=\($p)", "com.docker.compose.service=app"]} | @uri')"
  api "${DOCKER}/containers/json?all=1&filters=${filters}" | jq -r 'first(.[].Id) // empty'
}

deploy_stack
# O docker compose só recria a aplicação se a imagem mudou; confirma que ficou com a nova.
APP="$(app_container)"
if [[ -n "$APP" && "$(api "${DOCKER}/containers/${APP}/json" | jq -r '.Image')" != "$IMAGE_ID" ]]; then
  echo "→ A aplicação ainda usa a imagem anterior; a recriá-la"
  api -X DELETE "${DOCKER}/containers/${APP}?force=true" -o /dev/null
  deploy_stack
  APP="$(app_container)"
fi
[[ -n "$APP" ]] || { echo "A stack foi aplicada mas o contentor da aplicação não aparece. Ver a stack ${STACK} no Portainer." >&2; exit 1; }

echo "→ A remover imagens antigas sem etiqueta"
api -X POST "${DOCKER}/images/prune?filters=%7B%22dangling%22%3A%5B%22true%22%5D%7D" -o /dev/null || true

echo "→ À espera do site"
deadline=$((SECONDS + 240)); status=""
while (( SECONDS < deadline )); do
  status="$(api "${DOCKER}/containers/${APP}/json" | jq -r '.State.Health.Status // .State.Status')"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
if [[ "$status" == "healthy" ]]; then
  echo "✓ Publicado. A stack ${STACK} está a servir na porta ${HOST_PORT} do NAS."
  echo "  Se a base de dados estava vazia, a primeira sincronização com a AR já começou (alguns minutos)."
else
  echo "A aplicação arrancou mas está '${status}' ao fim de 4 min. Ver os registos no Portainer: stack ${STACK} → app → Logs." >&2
  exit 1
fi

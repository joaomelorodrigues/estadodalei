# Publicar no NAS

Como o estadodalei.pt é publicado no servidor do projeto: um NAS Synology com Portainer. Noutro servidor com Docker, basta `pnpm stack` (ver o [README](../README.md#alojar-num-servidor)).

A plataforma corre como stack `estadodalei` no Portainer, com o mesmo [docker-compose.yml](../docker-compose.yml) usado no Mac. Como nos outros sites do NAS, a imagem é construída no próprio NAS, o site usa uma porta no intervalo 20000-20099 e o HTTPS é feito pelo proxy inverso do DSM.

```sh
CHECK_ONLY=1 pnpm run deploy   # verifica token, Portainer e portas, sem mudar nada
pnpm run deploy                # constrói a imagem no NAS e cria/atualiza a stack
```

## Configuração local

O script [scripts/deploy-portainer.sh](../scripts/deploy-portainer.sh) lê o ficheiro `.env.production`, que fica fora do git:

```sh
PORTAINER_URL=https://<ip-do-nas>:<porta>   # obrigatório
HEARTBEAT_URL=https://hc-ping.com/<uuid>    # opcional: alerta por email se os dados ficarem desatualizados
ADMIN_TOKEN=<token longo>                   # opcional: ativa POST /api/admin/sync
```

O token do Portainer vem de `$PORTAINER_TOKEN` ou do ficheiro `~/.portainer-token` (Portainer → My account → Access tokens).

## O que o script faz

- constrói `estadodalei:latest` no NAS e envia o `docker-compose.yml` ao Portainer;
- na primeira vez cria a stack, com o MongoDB 4.4 e o volume `estadodalei_mongo-data`. O CPU do DS918+ não tem AVX, e o MongoDB 5+ não arranca sem AVX;
- nas vezes seguintes atualiza a stack, e só a app é recriada (o MongoDB e os dados mantêm-se);
- publica o site na porta 20003 do NAS e o MongoDB em `127.0.0.1:27018` (variáveis da stack `SITE_PORT`, `SITE_BIND`, `MONGO_IMAGE`, `MONGO_PORT`);
- guarda `HEARTBEAT_URL` e `ADMIN_TOKEN` como variáveis da stack.

O primeiro deploy demora vários minutos, porque o NAS instala as dependências e compila. Com a base de dados vazia, a primeira sincronização começa logo a seguir.

## Domínio e HTTPS (uma vez, no DSM)

1. DNS do domínio: registos `@` e `www` a apontar para o IP público.
2. Painel de Controlo → Portal de início de sessão → Avançado → Proxy inverso. Criar duas regras para `estadodalei.pt` (e as mesmas duas para `www.estadodalei.pt`):
   - origem HTTP, porta 80 → destino HTTP `localhost:20003`;
   - origem HTTPS, porta 443 → destino HTTP `localhost:20003`;
   - em cada regra: Cabeçalho personalizado → Criar → `X-Forwarded-Proto` = `$scheme`.
3. Painel de Controlo → Segurança → Certificado → Adicionar → Let's Encrypt para `estadodalei.pt`, com `www.estadodalei.pt` como nome alternativo. Em Configurar, associá-lo às regras de 443.

Comportamento da app atrás do proxy:

- pedidos que chegam com `X-Forwarded-Proto: http` são redirecionados (301) para `https://estadodalei.pt`;
- pedidos a `www.` são redirecionados para o domínio sem `www`;
- o acesso direto na rede local (`http://<NAS>:20003`) é servido tal como está.

## Monitorização

- **Alerta por email** (gratuito): criar um check em [healthchecks.io](https://healthchecks.io) com período de 3 h e tolerância de 3 h, pôr o URL de ping em `HEARTBEAT_URL` no `.env.production` e voltar a correr o deploy. Chega um email se os dados de alguma fonte ficarem com mais de 26 h (composição: 72 h), ou se o servidor deixar de enviar sinal.
- **Site público** (opcional): um monitor HTTP gratuito (por exemplo, UptimeRobot) a `https://estadodalei.pt/api/status`. Responde 503 quando os dados estão atrasados, por isso um só monitor apanha "site em baixo", "certificado inválido" e "dados desatualizados".

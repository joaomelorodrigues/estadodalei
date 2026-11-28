# estadodalei.pt

Serviço cívico independente que acompanha as propostas da Assembleia da República e as leis publicadas no Diário da República, para que todos saibam em que estado está cada lei.

- **Só dados oficiais.** Estado, votações, datas e autores vêm sempre das fontes oficiais, sincronizados automaticamente. Nada é escrito à mão nem gerado por IA.
- **Explicações revistas.** O texto em linguagem simples só aparece depois de revisto por uma pessoa.
- **Sem filiação partidária**, e com código aberto: qualquer pessoa pode ver como os dados são recolhidos e contados.

## Como funciona

A cada 3 horas, a sincronização descarrega os dados abertos das fontes oficiais, calcula o estado e a fase de cada iniciativa e guarda tudo no MongoDB. O site pede os dados à API em cada visita.

| Fonte | Uso | Notas |
|---|---|---|
| AR, Dados Abertos (`IniciativasXVII_json.txt`, `DiplomasXVII_json.txt`) | Principal | Sem API. Os endereços dos ficheiros são descobertos a partir das páginas do parlamento.pt. |
| open-data.pt | Reserva automática | Cópia normalizada dos mesmos dados. Não liga diplomas a iniciativas (as ligações existentes mantêm-se). |
| Diário da República, RSS da 1.ª série | Atos publicados | O feed só tem os atos do dia; o histórico acumula-se com sincronizações regulares. |
| open-data.pt, mandatos da legislatura | Composição do Parlamento | Lugares atuais por grupo (mandatos efetivos), usados no hemiciclo. |

- A sincronização corre segundo `SYNC_CRON` (por omissão, de 3 em 3 horas). Pode ser forçada com `pnpm sync` ou com `POST /api/admin/sync` (cabeçalho `Authorization: Bearer $ADMIN_TOKEN`).
- `SYNC_PROVIDER=opendata` força a fonte de reserva (útil para testar).
- Cada execução fica registada na coleção `syncruns` e aparece em `GET /api/meta`.
- O estado e a fase de cada iniciativa são calculados em [apps/api/src/sync/status.ts](apps/api/src/sync/status.ts) a partir das fases e votações oficiais.
- A AR publica o detalhe das votações com algumas semanas de atraso. Quando há uma votação sem resultado publicado, a iniciativa fica marcada com `voteResultPending`.

## Estrutura do código

Monorepositório pnpm, com MongoDB, Express, Astro e React:

| Pasta | O quê |
|---|---|
| [apps/api](apps/api) | Express 5 + Mongoose: API REST, sincronização das fontes e agendamento (node-cron). Em produção serve também o site. |
| [apps/site](apps/site) | Site Astro 5 (renderizado no servidor) com componentes React 19 e Tailwind 4. |
| [packages/shared](packages/shared) | Tipos e constantes partilhados (estados, fases, partidos). |

## Arrancar no computador

Requisitos: Docker (ex.: Docker Desktop), Node 22 ou mais recente e pnpm.

```sh
cp .env.example .env
pnpm install
pnpm dev     # arranca o MongoDB no Docker; API em :4000 e site em :4321, com recarregamento automático
pnpm sync    # sincronização manual, se a base de dados estiver vazia (cerca de 30 s)
```

Para ver a base de dados (por exemplo, no MongoDB Compass): `mongodb://127.0.0.1:27018`, base de dados `estadodalei`. O MongoDB só aceita ligações da própria máquina (`127.0.0.1`), porque não tem palavra-passe.

## Contribuir

As contribuições são bem-vindas.

- **Erro nos dados:** abre uma issue com a iniciativa e a ligação para a fonte oficial. Como os factos vêm sempre das fontes, a correção costuma estar na sincronização ([apps/api/src/sync](apps/api/src/sync)).
- **Código:** antes de abrir um pull request, corre `pnpm typecheck`. Os textos do site são em português de Portugal.

## Regra editorial

Os factos (estado, votações, datas, autores) vêm sempre das fontes, nunca de texto escrito à mão ou gerado por IA. As explicações em linguagem simples ficam no campo `explanation` da iniciativa e só aparecem no site com `status: "approved"`, ou seja, depois de revistas por uma pessoa. A sincronização nunca altera esse campo.

Sem explicação revista, o site mostra só os dados oficiais (título, fases, votações, documentos). As secções editoriais aparecem automaticamente quando a explicação existe:

| Campo de `explanation` | Onde aparece |
|---|---|
| `plainTitle`, `shortHook` | Título e frase de resumo em todo o site |
| `kidTranslation`, `summary`, `officialContext` | Separadores "Para Miúdos", "Para o Cidadão", "Texto Oficial" |
| `beforeAfter[]` (`topic`, `before`, `after`) | "Antes vs. Depois" |
| `affectedGroups[]` (`groupId`, `label`, `sentiment`, `consequence`, `example`) | "Quem é afetado", "O que muda para ti?", simulador por perfil em "O que muda para mim" (só aparece quando há explicações revistas) |
| `consequences[]`, `debate.pros[]`, `debate.cons[]` | Consequências e argumentos do debate |
| `theme`, `impactLevel`, `effectiveDate` | Etiquetas e datas |

Os `groupId` válidos estão em [apps/site/src/data/groups.ts](apps/site/src/data/groups.ts) (`CITIZEN_GROUPS`). Exemplo no mongosh, depois de revisto:

```js
db.initiatives.updateOne({ _id: "315160" }, { $set: { explanation: {
  status: "approved", plainTitle: "…", shortHook: "…", summary: "…",
  affectedGroups: [{ groupId: "jovens", label: "Jovens", sentiment: "mixed", consequence: "…", example: "…" }],
  reviewedBy: "nome", reviewedAt: new Date(), updatedAt: new Date(),
} } })
```

## API

| Rota | Descrição |
|---|---|
| `GET /api/today` | Resumo: atos do DR mais recentes, últimas votações, leis aprovadas, publicadas e novas, contagens |
| `GET /api/initiatives?q=&type=leis\|resolucoes\|outras\|todas&status=&stage=&party=&explained=&group=&theme=&area=&ids=&sort=activity\|entered&page=` | Lista paginada (`status`, `stage`, `area` e `ids` aceitam vários valores separados por vírgulas) |
| `GET /api/areas?select=` | Leis por área do dia a dia ("O que muda para mim"), pela comissão competente indicada pela AR; com `select`, as contagens sem repetições das áreas escolhidas |
| `GET /api/initiatives/:id` | Detalhe com fases, votações, diplomas e atos do DR |
| `GET /api/highlights?limit=` | Leis por aprovar (já passaram na generalidade), aprovadas e chumbadas, com a votação decisiva e os totais |
| `GET /api/party-record` | Balanço por partido na legislatura: leis propostas e o destino delas, sentido de voto, e a evolução mês a mês |
| `GET /api/composition` | Lugares atuais por grupo parlamentar |
| `GET /api/dre?date=AAAA-MM-DD` | Atos do Diário da República de um dia |
| `GET /api/meta` | Estado das sincronizações |
| `GET /api/status` | Frescura dos dados por fonte (503 se alguma estiver atrasada) |
| `GET /api/health` | Servidor e base de dados a responder (para o Docker) |

## Alojar num servidor

A plataforma é uma stack Docker Compose ([docker-compose.yml](docker-compose.yml)) com dois serviços:

| Serviço | O quê |
|---|---|
| `mongo` | MongoDB 4.4 (funciona também em CPUs sem AVX, que o MongoDB 5+ exige). Os dados ficam no volume `estadodalei_mongo-data`. |
| `app` | Site, API e sincronização automática, numa só imagem (`estadodalei:latest`). |

```sh
pnpm stack        # constrói a imagem e arranca MongoDB + app em http://localhost:4000
pnpm stack:stop
```

O `pnpm stack` e o `pnpm dev` usam ambos a porta 4000, por isso só um pode correr de cada vez. O servidor precisa de pelo menos 2 GB de RAM livres. O projeto é publicado num NAS Synology: ver [docs/publicar-no-nas.md](docs/publicar-no-nas.md).

Depois de arrancar, o site atualiza-se sozinho:

| Situação | Comportamento |
|---|---|
| Funcionamento normal | Sincroniza AR, Diário da República e composição de 3 em 3 h (hora de Lisboa) |
| Servidor esteve desligado | Ao arrancar, se os dados tiverem mais de 3 h, sincroniza logo |
| Portal da AR em baixo ou alterado | Usa o open-data.pt como reserva; volta à AR na execução seguinte |
| Sincronização presa | É cortada ao fim de `SYNC_TIMEOUT_MIN` (30 min) e a seguinte corre normalmente |
| Eleições / nova legislatura | Com `LEGISLATURE=auto`, deteta a nova pasta da AR e muda sozinho |
| Reinício da máquina | Os dois serviços voltam a arrancar (`restart: unless-stopped`) |

**Estatísticas de visitas (opcional):** com `POSTHOG_KEY` definido, o site conta as visitas com a [PostHog](https://posthog.com), sem cookies nem armazenamento no browser (`cookieless_mode`), por isso não precisa de aviso de cookies. O rodapé passa a dizê-lo a quem visita. Sem a chave, nada é enviado. No projeto da PostHog é preciso ativar o modo sem cookies nas definições, senão as visitas são ignoradas. Os robôs e browsers automáticos não contam.

Para confirmar a qualquer momento: `GET /api/status` (503 se alguma fonte estiver atrasada) ou o rodapé do site ("Dados oficiais atualizados hoje às …"). Com `HEARTBEAT_URL` definido (por exemplo, um check gratuito do [healthchecks.io](https://healthchecks.io)), chega um email quando os dados ficam atrasados ou o servidor deixa de responder.

Limite conhecido: o feed do Diário da República só tem os atos do próprio dia. Se o servidor estiver desligado um dia inteiro, a lista de atos desse dia (portarias, decretos-lei) perde-se. As leis da AR continuam a aparecer como publicadas, porque isso vem dos dados da AR.

### Mudar a versão do MongoDB

O MongoDB não abre ficheiros de dados de versões muito diferentes (ex.: 4.4 → 9.0). Para mudar de versão, copiar os dados e restaurá-los num volume novo:

```sh
mongodump --uri mongodb://127.0.0.1:27018/estadodalei --archive=estadodalei.archive
docker compose rm -sf mongo && docker volume rm estadodalei_mongo-data
# mudar MONGO_IMAGE no docker-compose.yml
docker compose up -d --wait mongo
mongorestore --uri mongodb://127.0.0.1:27018 --archive=estadodalei.archive
```

Tudo, exceto as explicações revistas, também se reconstrói com uma sincronização (`pnpm sync`).

## Licença

O código é distribuído com a licença [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Podes usá-lo, estudá-lo, alterá-lo e redistribuí-lo. Se publicares uma versão alterada como serviço na internet, tens de disponibilizar o código dessa versão a quem a usa, com a mesma licença.

Os dados vêm das fontes oficiais indicadas acima e estão sujeitos aos termos de cada uma. Os símbolos dos partidos ([apps/site/public/parties](apps/site/public/parties)) pertencem aos respetivos partidos e não estão abrangidos pela licença do código.

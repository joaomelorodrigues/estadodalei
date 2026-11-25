# syntax=docker/dockerfile:1
# Imagem única: API (Express) + site Astro (SSR) + sincronização agendada.

FROM node:22-bookworm-slim AS base
ENV CI=true
RUN npm install -g pnpm@12.18.0
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/site/package.json apps/site/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Só as dependências de produção na imagem final.
RUN pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime
# A sincronização lê um ficheiro da AR com ~100 MB (pico de ~0,8 GB de memória).
ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Europe/Lisbon \
    NODE_OPTIONS=--max-old-space-size=1536
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/site/package.json ./apps/site/package.json
COPY --from=build /app/apps/site/node_modules ./apps/site/node_modules
COPY --from=build /app/apps/site/dist ./apps/site/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

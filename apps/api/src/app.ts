import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import compression from "compression";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { api } from "./routes.js";

const log = logger("http");

type AstroHandler = (req: Request, res: Response, next: NextFunction, locals?: object) => void;

export async function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Atrás do proxy inverso do DSM (como os outros sites no NAS): as regras de 80 e 443
  // enviam X-Forwarded-Proto: $scheme. Visitantes em http:// e em www. vão para
  // https://<domínio>. Pedidos sem o cabeçalho (acesso direto na rede local,
  // healthcheck) são servidos tal como estão.
  app.use((req, res, next) => {
    const proto = req.get("x-forwarded-proto");
    const host = req.get("host") ?? "";
    if (proto && (proto === "http" || host.startsWith("www."))) {
      res.redirect(301, `https://${host.replace(/^www\./, "")}${req.originalUrl}`);
      return;
    }
    next();
  });

  // PostHog (se ativa): o browser envia as visitas para o servidor de ingestão e para o de
  // recursos (ex.: eu.i.posthog.com e eu-assets.i.posthog.com).
  const posthogHost = config.POSTHOG_KEY ? new URL(config.POSTHOG_HOST).origin : null;
  const posthogOrigins = posthogHost
    ? [...new Set([posthogHost, posthogHost.replace(/:\/\/(eu|us)\.i\./, "://$1-assets.i.")])]
    : [];

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // O HTTPS é imposto pelo redirecionamento acima. Esta diretiva partia o acesso
          // direto por http://<NAS>:<porta> na rede local.
          "upgrade-insecure-requests": null,
          "default-src": ["'self'"],
          // O Astro usa pequenos scripts inline para hidratar as ilhas React.
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          // As fontes vêm do próprio site (@fontsource-variable).
          "font-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'", ...posthogOrigins],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", api);

  // Em produção a API também serve o site Astro compilado (SSR em modo "middleware").
  const siteDist = config.SITE_DIST ?? path.resolve(process.cwd(), "../site/dist");
  const entry = path.join(siteDist, "server", "entry.mjs");
  if (fs.existsSync(entry)) {
    // As páginas pedem os dados à própria API.
    process.env.API_URL ??= `http://127.0.0.1:${config.PORT}`;
    const { handler } = (await import(pathToFileURL(entry).href)) as { handler: AstroHandler };
    app.use(
      express.static(path.join(siteDist, "client"), {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}_astro${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.use((req, res, next) => handler(req, res, next));
    log.info(`a servir o site de ${siteDist}`);
  } else {
    log.warn(`site não compilado (${entry} não existe); só a API está disponível`);
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error("erro não tratado", err);
    res.status(500).json({ error: "Erro interno" });
  });

  return app;
}

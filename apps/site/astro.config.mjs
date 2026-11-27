// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

export default defineConfig({
  site: "https://estadodalei.pt",
  // As páginas são geradas no servidor a cada pedido, com os dados da API.
  // Em produção o Express (apps/api) monta o handler gerado (modo "middleware").
  output: "server",
  adapter: node({ mode: "middleware" }),
  integrations: [
    react(),
    {
      // client:painted: hidrata depois da primeira pintura (ver src/directives/painted.ts).
      name: "client-painted",
      hooks: {
        "astro:config:setup": ({ addClientDirective }) =>
          addClientDirective({ name: "painted", entrypoint: fileURLToPath(new URL("./src/directives/painted.ts", import.meta.url)) }),
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Fontes sempre em ficheiro próprio (em cache), nunca embutidas na CSS como data:
      // (a CSP só aceita fontes do próprio site, e o Chrome carrega logo as embutidas).
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    },
    server: {
      // Em desenvolvimento, os pedidos do browser a /api vão para a API.
      proxy: { "/api": API_URL },
    },
  },
});

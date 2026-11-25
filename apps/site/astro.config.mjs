// @ts-check
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
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Em desenvolvimento, os pedidos do browser a /api vão para a API.
      proxy: { "/api": API_URL },
    },
  },
});

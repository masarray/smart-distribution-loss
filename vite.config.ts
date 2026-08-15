import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

function resolveBasePath() {
  const explicit = process.env.VITE_BASE_PATH;
  if (explicit) {
    const normalized = explicit.startsWith("/") ? explicit : `/${explicit}`;
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
    if (repository) {
      return repository === `${owner}.github.io` ? "/" : `/${repository}/`;
    }
  }

  return "/";
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});

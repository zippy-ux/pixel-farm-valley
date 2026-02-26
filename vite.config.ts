import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.html",
    },
  },
  define: (() => {
    try {
      const faviconPath = resolve(__dirname, "public", "favicon.png");
      const base64 = readFileSync(faviconPath).toString("base64");
      return {
        __BUILD_TIME__: Date.now(),
        __FAVICON_DATA_URL__: JSON.stringify(`data:image/png;base64,${base64}`),
      };
    } catch {
      return { __BUILD_TIME__: Date.now() };
    }
  })(),
  plugins: [
    {
      name: "inject-favicon-data-url",
      transformIndexHtml(html) {
        try {
          const faviconPath = resolve(__dirname, "public", "favicon.png");
          const faviconBuffer = readFileSync(faviconPath);
          const base64 = faviconBuffer.toString("base64");
          const dataUrl = `data:image/png;base64,${base64}`;
          const faviconLinks = /<link rel="icon" type="image\/png" href="[^"]*"[^>]*>\s*<link rel="shortcut icon"[^>]*>/;
          const faviconTags = `<link rel="apple-touch-icon" sizes="180x180" href="${dataUrl}" /><link rel="icon" type="image/png" sizes="192x192" href="${dataUrl}" /><link rel="icon" type="image/png" sizes="32x32" href="${dataUrl}" />`;
          return html.replace(faviconLinks, faviconTags);
        } catch {
          return html;
        }
      },
    },
  ],
});

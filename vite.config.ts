import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, "src/editor/index.html")
      }
    }
  }
});

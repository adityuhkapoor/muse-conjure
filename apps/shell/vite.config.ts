import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  // design/fonts (Muse Sans) lives outside the app root.
  server: { fs: { allow: ["../.."] }, proxy: { "/media": "http://127.0.0.1:4380" } },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages で https://<user>.github.io/where-to-go/ に公開するため base を設定
export default defineConfig({
  base: "/where-to-go/",
  plugins: [react()],
});

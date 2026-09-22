import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// docker compose 内では VITE_PROXY_TARGET=http://api:3000 を渡す。
// ホストで直接 vite を起動する場合は localhost:3000 に向く。
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Docker (bind mount) 上でファイル変更を確実に拾う
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return undefined;

          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "icons-vendor";
          }
          if (id.includes("/node_modules/axios/")) {
            return "network-vendor";
          }
          return undefined;
        }
      }
    }
  }
});

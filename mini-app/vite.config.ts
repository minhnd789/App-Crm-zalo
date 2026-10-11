import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import zaloMiniApp from "zmp-vite-plugin";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  root: "./",
  base: "",
  plugins: [react(), zaloMiniApp()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "zmp-ui", "zmp-sdk/apis", "dayjs", "qrcode.react"],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});

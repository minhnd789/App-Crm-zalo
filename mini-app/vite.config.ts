import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import zaloMiniApp from "zmp-vite-plugin";
import path from "node:path";
import fs from "node:fs";

/**
 * Mỗi thương hiệu là 1 Zalo Mini App riêng, build từ cùng mã nguồn:
 *   vite build --mode brand_a   → đọc .env.brand_a (VITE_BRAND=BRAND_A, ...)
 *   vite build --mode brand_b   → đọc .env.brand_b
 * VITE_APP_TITLE / VITE_HEADER_COLOR (tuỳ chọn) ghi đè title & headerColor trong app-config.json.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build" && !env.VITE_BRAND) {
    throw new Error(
      `Thiếu VITE_BRAND (mã thương hiệu) cho mode "${mode}". Tạo file .env.${mode} hoặc .env với VITE_BRAND=BRAND_A`,
    );
  }

  const appConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "app-config.json"), "utf-8"));
  if (env.VITE_APP_TITLE) {
    appConfig.app.title = env.VITE_APP_TITLE;
    appConfig.app.headerTitle = env.VITE_APP_TITLE;
  }
  if (env.VITE_HEADER_COLOR) appConfig.app.headerColor = env.VITE_HEADER_COLOR;

  return {
    root: "./",
    base: "",
    plugins: [react(), zaloMiniApp(appConfig)],
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
  };
});

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BRAND?: string;
  readonly VITE_ZALO_MOCK?: string;
  readonly VITE_ZALO_OA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

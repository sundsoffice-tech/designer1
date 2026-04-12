/// <reference types="vite/client" />

// rolldown-vite@7.2.2 is missing types/importMeta.d.ts.
// Manually declare until the upstream package ships the file.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DISABLE_RUNTIME?: string;
  readonly VITE_DISABLE_AI?: string;
  readonly VITE_ENABLE_AI_ASSISTANT?: string;
  readonly VITE_ENABLE_VOICE_ASSISTANT?: string;
  readonly VITE_ENABLE_ADMIN_PANEL?: string;
  readonly VITE_ENABLE_CAMERA_TOOLS?: string;
  readonly VITE_AI_API_BASE?: string;
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_CUSTOMER_ID?: string;
  readonly VITE_MODULE_CATALOG_URL?: string;
  readonly VITE_MODULE_CATALOG_FILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MOCK_API?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

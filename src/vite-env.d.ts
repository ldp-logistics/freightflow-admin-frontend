/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

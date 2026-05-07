/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATE_LOG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

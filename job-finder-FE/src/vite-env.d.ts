/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_USE_EMULATORS: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_FIRESTORE_DATABASE_ID: string
  readonly VITE_RECAPTCHA_SITE_KEY: string
  readonly VITE_RECAPTCHA_DEBUG_TOKEN?: string
  readonly MODE: string
  // Add other env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

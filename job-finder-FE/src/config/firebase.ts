import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth"
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check"
import { logger } from "@/services/logging"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app: FirebaseApp = initializeApp(firebaseConfig)
export const auth: Auth = getAuth(app)

const isBrowser = typeof window !== "undefined"
const mode = import.meta.env.MODE

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
const recaptchaDebugToken = import.meta.env.VITE_RECAPTCHA_DEBUG_TOKEN

if (isBrowser && mode === "development" && recaptchaDebugToken) {
  ;(globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    recaptchaDebugToken
}

if (!recaptchaSiteKey && mode !== "test") {
  const err =
    "CRITICAL ERROR: VITE_RECAPTCHA_SITE_KEY is missing. App Check cannot be initialized."
  if (mode === "production" || mode === "staging") {
    throw new Error(err)
  } else {
    console.warn(err)
  }
}

export const appCheck: AppCheck | null =
  isBrowser && recaptchaSiteKey
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  const authEmulatorHost = import.meta.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099"
  const [authHost, authPort] = authEmulatorHost.split(":")

  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true })

  logger.info("database", "started", "Connected to Firebase auth emulator", {
    details: {
      authHost,
      authPort,
    },
  })
}

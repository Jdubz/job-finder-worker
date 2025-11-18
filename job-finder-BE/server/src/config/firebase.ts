import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import { env } from './env'

let defaultApp: admin.app.App | null = null

function getCredentials() {
  const raw = readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf-8')
  return JSON.parse(raw)
}

export function getFirebaseApp(): admin.app.App {
  if (defaultApp) return defaultApp
  defaultApp = admin.initializeApp({
    credential: admin.credential.cert(getCredentials() as admin.ServiceAccount),
    projectId: env.FIREBASE_PROJECT_ID
  })
  return defaultApp
}

export function getAuth() {
  return getFirebaseApp().auth()
}

export function getAppCheck() {
  return getFirebaseApp().appCheck()
}

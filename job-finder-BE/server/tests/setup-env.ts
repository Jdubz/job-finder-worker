process.env.DATABASE_PATH = process.env.DATABASE_PATH ?? 'file:memory:?cache=shared'
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'test-project'
process.env.FIREBASE_SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '/tmp/firebase-service-account.json'

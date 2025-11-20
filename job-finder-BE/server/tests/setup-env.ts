import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DATABASE_PATH = process.env.DATABASE_PATH ?? 'file:memory:?cache=shared'
process.env.JF_SQLITE_MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ?? path.resolve(__dirname, '../../../infra/sqlite/migrations')

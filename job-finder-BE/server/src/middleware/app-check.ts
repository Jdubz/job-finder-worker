import type { Request, Response, NextFunction } from 'express'
import { getAppCheck } from '../config/firebase'
import { env } from '../config/env'

export async function verifyAppCheck(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-firebase-appcheck']
  if (env.NODE_ENV !== 'production' && !token) {
    return next()
  }
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ message: 'Missing App Check token' })
  }
  try {
    await getAppCheck().verifyToken(token)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid App Check token' })
  }
}

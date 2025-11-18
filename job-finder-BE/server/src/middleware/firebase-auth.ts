import type { Request, Response, NextFunction } from 'express'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { getAuth } from '../config/firebase'

export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Authorization header' })
  }

  const token = authHeader.slice('Bearer '.length)
  try {
    const decoded = await getAuth().verifyIdToken(token, true)
    ;(req as Request & { user?: DecodedIdToken }).user = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Invalid Firebase token' })
  }
}

import type { Request, Response, NextFunction } from 'express'

// Define allowed categories at module level for better performance
const allowedCategories = new Set([
  'worker', 'queue', 'pipeline', 'scrape', 'ai',
  'database', 'api', 'auth', 'client', 'system'
])

export function validateLogRequest(req: Request, res: Response, next: NextFunction) {
  const { logs, service, sessionId } = req.body

  // Basic validation
  if (!logs || !Array.isArray(logs)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Logs array is required',
    })
  }

  if (logs.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Logs array cannot be empty',
    })
  }

  if (logs.length > 100) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Maximum 100 logs per request',
    })
  }

  if (!service) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Service identifier is required',
    })
  }

  if (!sessionId) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Session ID is required',
    })
  }

  // Validate each log entry has required fields
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]

    if (!log.category || !log.action || !log.message) {
      return res.status(400).json({
        error: 'Invalid log entry',
        message: `Log at index ${i} missing required fields (category, action, message)`,
      })
    }

    // Validate category is one of the allowed values
    if (!allowedCategories.has(log.category)) {
      return res.status(400).json({
        error: 'Invalid log entry',
        message: `Log at index ${i} has invalid category: ${log.category}`,
      })
    }

    // Reject excessively large messages to avoid log bloat
    const size = Buffer.byteLength(JSON.stringify(log), 'utf8')
    if (size > 16 * 1024) {
      return res.status(400).json({
        error: 'Invalid log entry',
        message: `Log at index ${i} exceeds size limit`,
      })
    }
  }

  next()
}

const REQUEST_PREFIX = 'resume-generator-request'

export function generateRequestId(): string {
  const timestamp = Date.now()
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${REQUEST_PREFIX}-${timestamp}-${randomPart}`
}

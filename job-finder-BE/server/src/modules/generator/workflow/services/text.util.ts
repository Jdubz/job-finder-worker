export function cleanText(value?: string | null): string {
  if (!value) return ''
  let text = value
  text = text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/gi, '$1')
  text = text.replace(/\(([^()]+)\)\((https?:[^)]+)\)/gi, '$1')
  text = text.replace(/\((https?:[^)]+)\)/gi, '$1')
  text = text.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
  return text
}

export const cleanArray = (items?: string[] | null): string[] =>
  (items ?? []).map((item) => cleanText(item)).filter((item) => item !== '')

/** Escape HTML special characters to prevent injection in text content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Clean text and escape for safe HTML interpolation. */
export function safeText(value?: string | null): string {
  return escapeHtml(cleanText(value))
}

/** Escape a value for use inside an HTML attribute (href, src, etc.). */
export function escapeAttr(value: string): string {
  return escapeHtml(value)
}

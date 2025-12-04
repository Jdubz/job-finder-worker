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

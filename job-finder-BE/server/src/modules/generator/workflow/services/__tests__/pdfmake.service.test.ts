import { describe, it, expect } from 'vitest'
import { normalizeAssetPath } from '../pdfmake.service'

describe('normalizeAssetPath', () => {
  it('strips leading slash for stored asset paths', () => {
    expect(normalizeAssetPath('/assets/2025-01-01/avatar.png')).toBe('assets/2025-01-01/avatar.png')
  })

  it('removes public artifacts prefix for API URLs', () => {
    expect(normalizeAssetPath('/api/generator/artifacts/assets/2025/logo.svg')).toBe('assets/2025/logo.svg')
    expect(normalizeAssetPath('http://localhost/api/generator/artifacts/assets/2025/logo.svg')).toBe(
      'assets/2025/logo.svg'
    )
  })

  it('returns null for unrelated external URLs', () => {
    expect(normalizeAssetPath('https://cdn.example.com/images/avatar.png')).toBeNull()
  })
})

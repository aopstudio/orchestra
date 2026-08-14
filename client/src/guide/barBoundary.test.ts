import { describe, expect, it } from 'vitest'
import { nextBarBoundary } from './barBoundary'

describe('nextBarBoundary', () => {
  it('returns a multiple of bpi at least minAhead beats ahead', () => {
    expect(nextBarBoundary(0, 4, 1)).toBe(4)
    expect(nextBarBoundary(1.5, 4, 1)).toBe(4)
    expect(nextBarBoundary(3.9, 4, 1)).toBe(8) // 3.9+1=4.9 → ceil(4.9/4)*4 = 8
  })

  it('skips to the next boundary when minAhead crosses one', () => {
    expect(nextBarBoundary(2, 4, 1)).toBe(4) // 2+1=3 < 4
    expect(nextBarBoundary(2, 4, 3)).toBe(8) // 2+3=5 → ceil(5/4)*4=8
    expect(nextBarBoundary(3.9, 4, 4)).toBe(8)
  })

  it('handles exact boundaries and non-4 meters', () => {
    expect(nextBarBoundary(4, 4, 1)).toBe(8) // already on 4, +1 → 8
    expect(nextBarBoundary(0, 3, 2)).toBe(3)
    expect(nextBarBoundary(1, 3, 2)).toBe(3) // 1+2=3 → exactly on boundary
    expect(nextBarBoundary(1.1, 3, 2)).toBe(6) // 1.1+2=3.1 → ceil(3.1/3)*3 = 6
  })

  it('ensures the result is a bar boundary (mod bpi === 0)', () => {
    for (let b = 0; b < 100; b += 0.7) {
      for (const bpi of [2, 3, 4, 6]) {
        const boundary = nextBarBoundary(b, bpi, 1)
        expect(boundary % bpi).toBe(0)
        expect(boundary).toBeGreaterThanOrEqual(b + 1)
      }
    }
  })
})

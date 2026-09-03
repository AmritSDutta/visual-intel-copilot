import { describe, it, expect } from 'vitest'
import { normalizeLinearElement, sanitizeSkeletonsForExcalidraw } from '../libraryIndexer'

describe('libraryIndexer', () => {
  it('normalizeLinearElement zeroes points[0] and offsets x/y', () => {
    const el = normalizeLinearElement({ type: 'arrow', x: 10, y: 20, points: [[5, 5], [105, 55]] })
    expect(el.points[0]).toEqual([0, 0])
    expect(el.x).toBe(15)
    expect(el.y).toBe(25)
    expect(el.points[1]).toEqual([100, 50])
  })

  it('sanitizeSkeletonsForExcalidraw injects ids and drops dangling arrow bindings', () => {
    const [, rectNoId, arrow] = sanitizeSkeletonsForExcalidraw([
      { type: 'rectangle', id: 'keep_me', x: 0, y: 0, width: 10, height: 10 },
      { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
      { type: 'arrow', x: 0, y: 0, points: [[0, 0], [10, 10]], start: { id: 'does_not_exist' }, end: { id: 'keep_me' } }
    ])
    expect(rectNoId.id).toMatch(/^el_/)
    expect(arrow.start).toBeUndefined()
    expect(arrow.end).toEqual({ id: 'keep_me' })
    expect(arrow.points[0]).toEqual([0, 0])
  })
})

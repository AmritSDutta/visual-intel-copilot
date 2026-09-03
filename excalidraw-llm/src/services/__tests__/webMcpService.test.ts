import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convertToExcalidrawElements: (els: any[]) => els
}))

import {
  getCurrentIstDateTool,
  searchProductsTool,
  findCanvasNodesTool,
  registerActiveCanvasBridge
} from '../webMcpService'

describe('WebMCP tools (mocked bridge)', () => {
  afterEach(() => {
    // reset the module-level bridge
    registerActiveCanvasBridge({ getElements: () => [], setElements: () => {} })
  })

  it('get_current_ist_date returns the Asia/Kolkata wall clock', async () => {
    const res = await getCurrentIstDateTool.execute({} as never)
    expect(typeof res.ist).toBe('string')
    // ICU may omit the zone name — verify the hour/meridiem against an independent formatter
    const actual = res.ist.match(/(\d{1,2}):\d{2}:\d{2}\s*([ap]m)/i)
    const expected = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).match(/(\d{1,2}):\d{2}\s*([AP]M)/i)
    expect(actual).not.toBeNull()
    expect(expected).not.toBeNull()
    expect(actual![1]).toBe(expected![1])
    expect(actual![2].toLowerCase()).toBe(expected![2].toLowerCase())
  })

  it('search_products returns catalog and respects limit', async () => {
    const all = await searchProductsTool.execute({ query: '' })
    expect(all.results.length).toBe(3)
    const limited = await searchProductsTool.execute({ query: '', limit: 2 })
    expect(limited.results.length).toBe(2)
  })

  it('find_canvas_nodes matches by id via the active bridge', async () => {
    const unregister = registerActiveCanvasBridge({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getElements: () => [{ id: 'node_db_1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }] as any[],
      setElements: () => {}
    })
    const res = await findCanvasNodesTool.execute({ query: 'node_db' })
    expect(res.matchCount).toBe(1)
    expect(res.nodes[0].id).toBe('node_db_1')
    unregister()
  })
})

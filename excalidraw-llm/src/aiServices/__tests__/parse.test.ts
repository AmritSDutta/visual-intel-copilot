import { describe, it, expect, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convertToExcalidrawElements: (els: any[]) => els.map((e, i) => ({ ...e, id: e.id ?? `mock_${i}` }))
}))

import { extractJsonPayload, processResponseJson } from '../parse'
import { repairAndParseJson } from '../../utils/jsonRepair'

describe('LLM JSON pipeline', () => {
  it('extractJsonPayload strips markdown code fences', () => {
    const text = 'Here is the diagram:\n```json\n{"chatReply":"hi","elements":[]}\n```\nDone.'
    expect(JSON.parse(extractJsonPayload(text))).toEqual({ chatReply: 'hi', elements: [] })
  })

  it('repairAndParseJson parses valid JSON untouched', () => {
    expect(repairAndParseJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('repairAndParseJson removes trailing commas', () => {
    expect(repairAndParseJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('repairAndParseJson closes unclosed braces/brackets', () => {
    expect(repairAndParseJson('{"a":{"b":[1,2')).toEqual({ a: { b: [1, 2] } })
  })

  it('processResponseJson returns chatReply + converted elements', () => {
    const json = JSON.stringify({
      chatReply: 'A simple box',
      elements: [{ type: 'rectangle', id: 'r1', x: 0, y: 0, width: 100, height: 80 }]
    })
    const result = processResponseJson(json, [])
    expect(result.chatReply).toBe('A simple box')
    expect(result.elements.length).toBeGreaterThan(0)
    expect(result.elements[0].type).toBe('rectangle')
  })
})

import { describe, it, expect } from 'vitest'
import { MAX_INPUT_CHARS, VOICE_LIVE_MAX_CHARS, clampInput, isVoiceLiveEligible } from '../limits'

describe('input limits', () => {
  it('clampInput caps input at MAX_INPUT_CHARS in both workspaces', () => {
    expect(MAX_INPUT_CHARS).toBe(5000)
    expect(clampInput('a'.repeat(6000))).toHaveLength(5000)
    expect(clampInput('short')).toBe('short')
  })

  it('routes voice queries to the Live audio session only when short enough', () => {
    expect(VOICE_LIVE_MAX_CHARS).toBe(500)
    expect(isVoiceLiveEligible('draw a microservice diagram')).toBe(true)
    expect(isVoiceLiveEligible('x'.repeat(501))).toBe(false)
    // whitespace-only padding doesn't stretch a short query past the limit
    expect(isVoiceLiveEligible(`   ${'x'.repeat(100)}   `)).toBe(true)
  })
})

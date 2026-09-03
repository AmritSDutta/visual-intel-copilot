/** Shared input limits for both workspaces. */
export const MAX_INPUT_CHARS = 5000
export const VOICE_LIVE_MAX_CHARS = 500

/** Clamp typed/pasted input to the hard cap (textarea maxLength is the first line of defense). */
export function clampInput(text: string): string {
  return text.length <= MAX_INPUT_CHARS ? text : text.slice(0, MAX_INPUT_CHARS)
}

/** Long texts (pasted READMEs etc.) skip the Gemini Live audio session — it's built for short spoken utterances. */
export function isVoiceLiveEligible(text: string): boolean {
  return text.trim().length <= VOICE_LIVE_MAX_CHARS
}

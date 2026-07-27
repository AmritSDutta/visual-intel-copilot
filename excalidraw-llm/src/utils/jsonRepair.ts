/**
 * Resilient JSON Repair & Fallback Parser.
 * Handles truncated JSON from LLMs, unclosed brackets/braces, unescaped quotes, and trailing commas.
 */
export function repairAndParseJson(rawText: string): any {
  if (!rawText) throw new Error('Empty JSON response');

  let clean = rawText.trim();

  // 1. First try standard JSON.parse
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Continue to repair steps
  }

  // 2. Remove trailing commas before closing braces/brackets
  clean = clean.replace(/,\s*([\}\]])/g, '$1');

  // 3. Fix unescaped newlines in JSON string values
  clean = clean.replace(/(:\s*"[^"]*)\n([^"]*")/g, '$1\\n$2');

  try {
    return JSON.parse(clean);
  } catch (e) {
    // Continue to bracket repair
  }

  // 4. Handle truncated JSON outputs (unclosed quotes, brackets, braces)
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces = Math.max(0, openBraces - 1);
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets = Math.max(0, openBrackets - 1);
    }
  }

  // Auto-close open string if cut off mid-quote
  if (inString) {
    clean += '"';
  }

  // Auto-close missing brackets and braces
  while (openBrackets > 0) {
    clean += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    clean += '}';
    openBraces--;
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('JSON repair failed for text:', rawText);
    throw new Error('Unable to parse AI response. Please try a slightly shorter prompt.');
  }
}

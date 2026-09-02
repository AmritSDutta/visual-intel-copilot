import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { hydrateSkeletonsWithLibrary, sanitizeSkeletonsForExcalidraw } from '../utils/libraryIndexer';
import { repairAndParseJson } from '../utils/jsonRepair';
import { stripMarkdown } from './prompts';
import type { AIDiagramResult } from './types';

export function extractJsonPayload(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  const mdMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch && mdMatch[1]) {
    clean = mdMatch[1].trim();
  }

  const firstObj = clean.indexOf('{');
  const lastObj = clean.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    return clean.substring(firstObj, lastObj + 1).trim();
  }

  const firstArr = clean.indexOf('[');
  const lastArr = clean.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    return clean.substring(firstArr, lastArr + 1).trim();
  }

  return clean;
}

export function processResponseJson(cleanJsonStr: string, rawLibraryItems: any[] = []): AIDiagramResult {
  const extracted = extractJsonPayload(cleanJsonStr);
  let parsed: any;
  try {
    parsed = repairAndParseJson(extracted);
  } catch (e) {
    console.error('Failed to parse AI JSON response:', cleanJsonStr, 'Extracted:', extracted);
    throw new Error('AI returned an invalid JSON response format. Please try rephrasing your prompt or selecting a smaller diagram scope.');
  }

  let chatReply = 'I have generated your requested diagram on the canvas.';
  let skeletons: any[] = [];

  if (Array.isArray(parsed)) {
    skeletons = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (typeof parsed.chatReply === 'string' && parsed.chatReply.trim()) {
      chatReply = stripMarkdown(parsed.chatReply.trim());
    }
    if (Array.isArray(parsed.elements)) {
      skeletons = parsed.elements;
    }
  }

  const { standardSkeletons, hydratedElements } = hydrateSkeletonsWithLibrary(skeletons, rawLibraryItems);
  const sanitizedSkeletons = sanitizeSkeletonsForExcalidraw(standardSkeletons);
  const convertedStandard = convertToExcalidrawElements(sanitizedSkeletons, { regenerateIds: true });
  const finalElements = [...convertedStandard, ...hydratedElements];

  return {
    chatReply,
    elements: finalElements
  };
}

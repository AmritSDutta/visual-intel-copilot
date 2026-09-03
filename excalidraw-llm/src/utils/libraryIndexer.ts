export interface LibraryCatalogItem {
  id: string;
  name: string;
}

/**
  * Parses raw Excalidraw library items into a compact catalog array (id + name) (~550 tokens for 73 items).
  */
export function buildLibraryCatalog(libraryItems: any[]): LibraryCatalogItem[] {
  if (!Array.isArray(libraryItems)) return [];

  return libraryItems.map((item, index) => {
    const itemId = item?.id || `lib_item_${index}`;
    // Look for text element inside the library item to use as descriptive component name
    const textElement = Array.isArray(item?.elements) 
      ? item.elements.find((e: any) => e && e.type === 'text' && typeof e.text === 'string' && e.text.trim()) 
      : null;

    let componentName = (textElement && typeof textElement.text === 'string')
      ? textElement.text.replace(/[\r\n]+/g, ' ').trim() 
      : `Component ${index + 1}`;
    // Sanitize component name
    if (componentName.length > 40) {
      componentName = componentName.substring(0, 40) + '...';
    }

    return {
      id: itemId,
      name: componentName
    };
  });
}

/**
 * Normalizes linear element (arrow/line/freedraw) points so that points[0] is strictly [0, 0]
 * and all offsets are correctly applied to the element's (x, y) coordinates.
 * Strictly prevents Excalidraw's "Linear element is not normalized Error".
 */
export function normalizeLinearElement(element: any): any {
  if (!element || (element.type !== 'arrow' && element.type !== 'line' && element.type !== 'freedraw')) {
    return element;
  }

  const el = { ...element };
  let points = Array.isArray(el.points) ? el.points : [];

  // If points array is empty or malformed
  if (!points.length || !Array.isArray(points[0])) {
    const dx = typeof el.width === 'number' && el.width !== 0 ? el.width : 180;
    const dy = typeof el.height === 'number' ? el.height : 0;
    el.points = [[0, 0], [dx, dy]];
    return el;
  }

  // If first point is not [0, 0], shift origin to points[0]
  const firstX = typeof points[0][0] === 'number' ? points[0][0] : 0;
  const firstY = typeof points[0][1] === 'number' ? points[0][1] : 0;

  if (firstX !== 0 || firstY !== 0) {
    el.x = (typeof el.x === 'number' ? el.x : 0) + firstX;
    el.y = (typeof el.y === 'number' ? el.y : 0) + firstY;
    points = points.map((p: any) => {
      if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') {
        return [p[0] - firstX, p[1] - firstY];
      }
      return [0, 0];
    });
  }

  // Ensure there are at least 2 distinct points
  if (points.length < 2) {
    const dx = typeof el.width === 'number' && el.width !== 0 ? el.width : 180;
    const dy = typeof el.height === 'number' ? el.height : 0;
    points = [[0, 0], [dx, dy]];
  }

  // Guarantee points[0] is exactly [0, 0]
  points[0] = [0, 0];
  el.points = points;

  return el;
}

/**
  * Sanitizes element skeletons to guarantee valid top-level text string properties for convertToExcalidrawElements.
  */
export function sanitizeSkeletonsForExcalidraw(skeletons: any[]): any[] {
  if (!Array.isArray(skeletons)) return [];

  // 1. First pass: normalize IDs and text content
  const validElementIds = new Set<string>();
  const sanitized = skeletons
    .filter(item => item && typeof item === 'object' && typeof item.type === 'string')
    .map(item => {
      const el = { ...item };

      // Ensure unique element ID
      if (!el.id) {
        el.id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      if (el.type !== 'arrow' && el.type !== 'line') {
        validElementIds.add(el.id);
      }

      // CRITICAL: type: "text" elements MUST have a valid top-level string text property for convertToExcalidrawElements
      if (el.type === 'text') {
        const textContent = typeof el.text === 'string'
          ? el.text
          : (typeof el.label?.text === 'string' ? el.label.text : (typeof el.label === 'string' ? el.label : 'Text'));
        el.text = textContent || 'Text';
      }

      // Normalize label objects
      if (el.label && typeof el.label === 'object') {
        el.label = {
          ...el.label,
          text: typeof el.label.text === 'string' ? el.label.text : (typeof el.text === 'string' ? el.text : '')
        };
      } else if (typeof el.label === 'string') {
        el.label = { text: el.label };
      }

      return el;
    });

  // 2. Second pass: validate arrow bindings against existing element IDs & normalize linear elements
  return sanitized.map(el => {
    if (el.type === 'arrow' || el.type === 'line' || el.type === 'freedraw') {
      let cleanEl = { ...el };

      // Check start element validity
      const startId = cleanEl.start?.id || cleanEl.startBinding?.elementId;
      if (startId && !validElementIds.has(startId)) {
        delete cleanEl.start;
        delete cleanEl.startBinding;
      }

      // Check end element validity
      const endId = cleanEl.end?.id || cleanEl.endBinding?.elementId;
      if (endId && !validElementIds.has(endId)) {
        delete cleanEl.end;
        delete cleanEl.endBinding;
      }

      return normalizeLinearElement(cleanEl);
    }
    return el;
  });
}

/**
  * Replaces libraryItem references from LLM JSON with actual cloned vector elements offset to target (x, y),
  * and pre-processes arrow skeletons to ensure points, arrowheads, and bindings render visibly.
  */
export function hydrateSkeletonsWithLibrary(skeletons: any[], rawLibraryItems: any[]): { standardSkeletons: any[], hydratedElements: any[] } {
  if (!Array.isArray(skeletons)) return { standardSkeletons: [], hydratedElements: [] };

  const standardSkeletons: any[] = [];
  const hydratedElements: any[] = [];

  const libraryMap = new Map<string, any>();
  if (Array.isArray(rawLibraryItems)) {
    rawLibraryItems.forEach((item, index) => {
      const id = item?.id || `lib_item_${index}`;
      libraryMap.set(id, item);
      const textElement = Array.isArray(item?.elements) ? item.elements.find((e: any) => e && e.type === 'text' && typeof e.text === 'string') : null;
      if (textElement && typeof textElement.text === 'string') {
        libraryMap.set(textElement.text.toLowerCase().trim(), item);
      }
    });
  }

  // 1. First pass: Hydrate library items and index shape bounds
  const shapeBoundsMap = new Map<string, { x: number; y: number; width: number; height: number }>();

  for (const item of skeletons) {
    if (item.type === 'libraryItem' || item.libraryId) {
      const targetLibId = item.libraryId || item.id;
      const matchedLib = libraryMap.get(targetLibId) || libraryMap.get(String(targetLibId).toLowerCase());

      if (matchedLib && Array.isArray(matchedLib.elements) && matchedLib.elements.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        matchedLib.elements.forEach((el: any) => {
          if (typeof el.x === 'number') {
            minX = Math.min(minX, el.x);
            maxX = Math.max(maxX, el.x + (el.width || 0));
          }
          if (typeof el.y === 'number') {
            minY = Math.min(minY, el.y);
            maxY = Math.max(maxY, el.y + (el.height || 0));
          }
        });

        if (minX === Infinity) minX = 0;
        if (minY === Infinity) minY = 0;
        if (maxX === -Infinity) maxX = minX + 100;
        if (maxY === -Infinity) maxY = minY + 100;

        const targetX = typeof item.x === 'number' ? item.x : 100;
        const targetY = typeof item.y === 'number' ? item.y : 100;
        const offsetX = targetX - minX;
        const offsetY = targetY - minY;
        const width = maxX - minX;
        const height = maxY - minY;

        const clonedElements = matchedLib.elements.map((el: any) => ({
          ...el,
          id: `${el.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          x: el.x + offsetX,
          y: el.y + offsetY,
          version: (el.version || 1) + 1,
          versionNonce: Math.floor(Math.random() * 2000000000)
        }));

        if (item.id) {
          shapeBoundsMap.set(item.id, { x: targetX, y: targetY, width, height });
        }

        hydratedElements.push(...clonedElements);
        continue;
      }
    }

    if (item.type !== 'arrow' && item.type !== 'line') {
      if (item.id) {
        shapeBoundsMap.set(item.id, {
          x: typeof item.x === 'number' ? item.x : 0,
          y: typeof item.y === 'number' ? item.y : 0,
          width: typeof item.width === 'number' ? item.width : 160,
          height: typeof item.height === 'number' ? item.height : 80
        });
      }
      standardSkeletons.push(item);
    }
  }

  // 2. Second pass: Process arrows & lines with calculated relative points
  for (const item of skeletons) {
    if (item.type === 'arrow' || item.type === 'line') {
      const arrowItem = { ...item };

      if (!arrowItem.endArrowhead && arrowItem.type === 'arrow') {
        arrowItem.endArrowhead = 'triangle';
      }
      if (!arrowItem.strokeWidth) {
        arrowItem.strokeWidth = 2;
      }
      if (!arrowItem.strokeColor) {
        arrowItem.strokeColor = '#9ca3af';
      }

      const startId = arrowItem.start?.id;
      const endId = arrowItem.end?.id;
      const startShape = startId ? shapeBoundsMap.get(startId) : null;
      const endShape = endId ? shapeBoundsMap.get(endId) : null;

      if (startShape && endShape) {
        let startX: number, startY: number, endX: number, endY: number;

        const centerAX = startShape.x + startShape.width / 2;
        const centerAY = startShape.y + startShape.height / 2;
        const centerBX = endShape.x + endShape.width / 2;
        const centerBY = endShape.y + endShape.height / 2;

        const dx = centerBX - centerAX;
        const dy = centerBY - centerAY;

        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx >= 0) {
            startX = startShape.x + startShape.width;
            startY = centerAY;
            endX = endShape.x;
            endY = centerBY;
          } else {
            startX = startShape.x;
            startY = centerAY;
            endX = endShape.x + endShape.width;
            endY = centerBY;
          }
        } else {
          if (dy >= 0) {
            startX = centerAX;
            startY = startShape.y + startShape.height;
            endX = centerBX;
            endY = endShape.y;
          } else {
            startX = centerAX;
            startY = startShape.y;
            endX = centerBX;
            endY = endShape.y + endShape.height;
          }
        }

        arrowItem.x = startX;
        arrowItem.y = startY;
        arrowItem.points = [[0, 0], [endX - startX, endY - startY]];
      } else if (!Array.isArray(arrowItem.points) || arrowItem.points.length === 0) {
        const dx = typeof arrowItem.width === 'number' && arrowItem.width !== 0 ? arrowItem.width : 180;
        const dy = typeof arrowItem.height === 'number' ? arrowItem.height : 0;
        arrowItem.points = [[0, 0], [dx, dy]];
      }

      standardSkeletons.push(normalizeLinearElement(arrowItem));
    }
  }

  return { standardSkeletons, hydratedElements };
}

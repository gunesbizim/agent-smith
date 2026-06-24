// Tolerant JSON extraction from model output.
//
// Headless agents are asked to return JSON, but may wrap it in prose or a ```json fence. Pure-JSON
// artifacts (objects OR arrays) parse directly; prose-wrapped output falls back to slicing the
// outermost bracket. Returns null if nothing parses.
export function extractJson<T = unknown>(text: string | null): T | null {
  if (!text) return null;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fence ? [fence[1], text] : [text];

  for (const c of candidates) {
    const trimmed = c.trim();
    const direct = tryParse<T>(trimmed);
    if (direct !== null) return direct;
    const sliced = sliceOutermost(trimmed);
    if (sliced) {
      const parsed = tryParse<T>(sliced);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Slice from the first top-level bracket to its matching closer. Picks object vs array by whichever
// opening bracket appears first, so a leading array isn't mistaken for an object.
function sliceOutermost(text: string): string | null {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  if (objStart < 0 && arrStart < 0) return null;

  const useObject = arrStart < 0 || (objStart >= 0 && objStart < arrStart);
  const start = useObject ? objStart : arrStart;
  const end = text.lastIndexOf(useObject ? "}" : "]");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

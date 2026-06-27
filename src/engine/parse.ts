// Tolerant JSON extraction from model output.
//
// Headless agents are asked to return JSON, but may wrap it in prose or a ```json fence. Pure-JSON
// artifacts (objects OR arrays) parse directly; prose-wrapped output falls back to slicing the
// outermost bracket. Returns null if nothing parses.
export function extractJson<T = unknown>(text: string | null): T | null {
  if (!text) return null;

  const fence = extractFenceContent(text);
  const candidates = fence !== null ? [fence, text] : [text];

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

// Extract the body of the first ```[json] … ``` fence without a lazy wildcard (avoids S8786).
function extractFenceContent(text: string): string | null {
  const open = text.indexOf("```");
  if (open < 0) return null;
  // Skip optional language tag (e.g. "json") up to first newline; if no newline, body starts right after ```
  let body = open + 3;
  const nl = text.indexOf("\n", body);
  if (nl >= 0) {
    const tag = text.slice(body, nl).trim().toLowerCase();
    if (tag === "" || tag === "json") body = nl + 1;
  }
  const close = text.indexOf("```", body);
  if (close < 0) return null;
  return text.slice(body, close);
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

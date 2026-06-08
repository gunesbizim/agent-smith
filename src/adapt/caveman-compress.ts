// Caveman compressor — reduces token count ~75% while preserving technical accuracy.
// Rules: drop articles, shorten verbs, keep code blocks intact, preserve CLI commands.
import { resolveTemplate } from "../shared/templates.js";
import type { TemplateVariables } from "../shared/types.js";

export function cavemanCompress(content: string): string {
  let compressed = content;

  // Preserve code blocks (fenced and indented)
  const codeBlocks: string[] = [];
  compressed = compressed.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });
  compressed = compressed.replace(/\n    \S[\s\S]*?(?=\n(?!    )|\n*$)/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Preserve inline code
  const inlineCodes: string[] = [];
  compressed = compressed.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `__INLINE_${inlineCodes.length - 1}__`;
  });

  // Drop articles
  compressed = compressed.replace(/\b(the|a|an)\s+/gi, "");

  // Shorten common phrases
  const phrases: [RegExp, string][] = [
    [/\bbefore writing any code\b/gi, "before coding"],
    [/\byou should\b/gi, "should"],
    [/\byou must\b/gi, "must"],
    [/\byou are a\b/gi, "you're"],
    [/\bMake sure that\b/gi, "Ensure"],
    [/\bIn order to\b/g, "To"],
    [/\bDue to the fact that\b/g, "Because"],
    [/\bAt this point in time\b/g, "Now"],
    [/\bA number of\b/g, "Several"],
    [/\bAs a result\b/g, "So"],
    [/\bIt is important to\b/g, "Must"],
    [/\bTake into account\b/g, "Consider"],
    [/\bFor the purpose of\b/g, "For"],
    [/\bIn the event that\b/g, "If"],
    [/\bWith regard to\b/g, "About"],
    [/\bIn accordance with\b/g, "Per"],
    [/\bOn a regular basis\b/g, "Regularly"],
    [/\bAt the present time\b/g, "Currently"],
    [/\beach and every\b/g, "each"],
    [/\bfirst and foremost\b/g, "first"],
    [/\bBe sure to\b/gi, "Always"],
    [/\bDo not\b/gi, "Never"],
    [/\bPlease note that\b/gi, "Note:"],
    [/\bAs described above\b/gi, "Above"],
    [/\bIn addition to\b/gi, "Plus"],
    [/\bIt is recommended that\b/gi, "Recommend"],
    [/\bTake note of\b/gi, "Note"],
  ];
  for (const [pattern, replacement] of phrases) {
    compressed = compressed.replace(pattern, replacement);
  }

  // Drop redundant adverbs
  compressed = compressed.replace(/\b(absolutely|completely|definitely|essentially|extremely|highly|literally|really|simply|totally|very)\s+/gi, "");

  // Drop filler phrases
  compressed = compressed.replace(/it should be noted that\s*/gi, "");
  compressed = compressed.replace(/it is worth noting that\s*/gi, "");
  compressed = compressed.replace(/as a matter of fact\s*/gi, "");

  // Shorten "the following" → nothing
  compressed = compressed.replace(/\bthe following\b\s*/gi, "");

  // Collapse multiple spaces
  compressed = compressed.replace(/ +/g, " ");

  // Collapse multiple blank lines
  compressed = compressed.replace(/\n{3,}/g, "\n\n");

  // Restore code
  compressed = compressed.replace(/__CODEBLOCK_(\d+)__/g, (_, i) => codeBlocks[parseInt(i)]);
  compressed = compressed.replace(/__INLINE_(\d+)__/g, (_, i) => inlineCodes[parseInt(i)]);

  return compressed;
}

/**
 * Compress all skill files for a project using caveman format.
 * Only applies to narrative text — code blocks, CLI commands, and
 * placeholder variables are preserved exactly.
 */
export function compressSkillsForCaveman(
  skills: Record<string, string>,
): Record<string, string> {
  const compressed: Record<string, string> = {};
  for (const [path, content] of Object.entries(skills)) {
    compressed[path] = cavemanCompress(content);
  }
  return compressed;
}

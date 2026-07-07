// 責務: エンジン層ソースの識別子・文字列・コメントを完全一致トークン照合する（検出器仕様書§5.1）
import { readFileSync } from "node:fs";
import type { BanLexicon } from "./ban-lexicon-builder";

export type AuditHitContext = "comment" | "identifier" | "string";

export interface AuditHit {
  readonly file: string;
  readonly line: number;
  readonly token: string;
  readonly context: AuditHitContext;
}

const SEGMENT_PATTERN =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const WORD_PATTERN = /[\p{L}\p{N}_$]+/gu;
const FIRST_LINE = 1;

function lineNumberAt(text: string, index: number): number {
  let line = FIRST_LINE;
  for (let i = 0; i < index; i += 1) {
    if (text.charAt(i) === "\n") {
      line += 1;
    }
  }
  return line;
}

function classifySegment(matchText: string): AuditHitContext {
  return matchText.startsWith("/*") || matchText.startsWith("//") ? "comment" : "string";
}

export class SourceScanner {
  constructor(private readonly lexicon: BanLexicon) {}

  scanText(file: string, text: string): AuditHit[] {
    const hits: AuditHit[] = [];
    const codeRanges: Array<{ start: number; end: number }> = [];
    let cursor = 0;

    SEGMENT_PATTERN.lastIndex = 0;
    let match = SEGMENT_PATTERN.exec(text);
    while (match !== null) {
      if (match.index > cursor) {
        codeRanges.push({ start: cursor, end: match.index });
      }
      const context = classifySegment(match[0]);
      for (const entry of this.lexicon.entries) {
        if (match[0].includes(entry.token)) {
          hits.push({ file, line: lineNumberAt(text, match.index), token: entry.token, context });
        }
      }
      cursor = match.index + match[0].length;
      match = SEGMENT_PATTERN.exec(text);
    }
    if (cursor < text.length) {
      codeRanges.push({ start: cursor, end: text.length });
    }

    for (const range of codeRanges) {
      const codeText = text.slice(range.start, range.end);
      WORD_PATTERN.lastIndex = 0;
      let wordMatch = WORD_PATTERN.exec(codeText);
      while (wordMatch !== null) {
        const word = wordMatch[0];
        if (this.lexicon.has(word)) {
          const absoluteIndex = range.start + wordMatch.index;
          hits.push({ file, line: lineNumberAt(text, absoluteIndex), token: word, context: "identifier" });
        }
        wordMatch = WORD_PATTERN.exec(codeText);
      }
    }

    return hits;
  }

  scan(files: readonly string[]): AuditHit[] {
    const hits: AuditHit[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      hits.push(...this.scanText(file, text));
    }
    return hits;
  }
}

// 責務: JSON文字列を未検証構造体へ変換する（構文エラーをValidationIssueへ変換）
import type { PackParser, ParseResult } from "../../application/pack/pack-parser";
import type { RawPackSource } from "../../application/pack/raw-pack-source";
import { errorIssue } from "../../domain/pack/validation/issue";

export class JsonPackParser implements PackParser {
  parse(raw: RawPackSource): ParseResult {
    try {
      const candidate: unknown = JSON.parse(raw.text);
      return { candidate, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { issues: [errorIssue("structural/json-syntax", raw.origin, `JSON構文エラー: ${message}`)] };
    }
  }
}

// 責務: パック原文を未検証構造体へ変換するインターフェース（実装はinfrastructure/pack のJsonPackParser）
import type { ValidationIssue } from "../../domain/pack/validation/issue";
import type { RawPackSource } from "./raw-pack-source";

export interface ParseResult {
  readonly candidate?: unknown;
  readonly issues: readonly ValidationIssue[];
}

export interface PackParser {
  parse(raw: RawPackSource): ParseResult;
}

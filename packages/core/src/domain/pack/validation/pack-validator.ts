// 責務: 検証4類を固定順（構造→数値→憲法→境界）で実行し報告を合成する。決定論的（同一入力→同一報告）
import { BoundaryRules } from "./boundary-rules";
import { ConstitutionRules } from "./constitution-rules";
import { getProp, isRecord, isString } from "./guards";
import { NumericRules } from "./numeric-rules";
import { type ValidationReport, createValidationReport } from "./report";
import { StructuralRules } from "./structural-rules";

function extractPackId(candidate: unknown): string | undefined {
  if (!isRecord(candidate)) {
    return undefined;
  }
  const meta = getProp(candidate, "meta");
  if (!isRecord(meta)) {
    return undefined;
  }
  const packId = getProp(meta, "packId");
  return isString(packId) ? packId : undefined;
}

export const PackValidator = {
  validate(candidate: unknown): ValidationReport {
    const issues = [
      ...StructuralRules.check(candidate),
      ...NumericRules.check(candidate),
      ...ConstitutionRules.check(candidate),
      ...BoundaryRules.check(candidate),
    ];
    return createValidationReport(extractPackId(candidate), issues);
  },
};

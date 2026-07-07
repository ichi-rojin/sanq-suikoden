// 責務: 検証結果の集約（05-data-structures.md §2）
import type { ValidationIssue } from "./issue";

export interface ValidationReportCounts {
  readonly error: number;
  readonly warning: number;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly packId?: string;
  readonly issues: readonly ValidationIssue[];
  readonly counts: ValidationReportCounts;
  toJson(): Readonly<Record<string, unknown>>;
}

export function createValidationReport(
  packId: string | undefined,
  issues: readonly ValidationIssue[],
): ValidationReport {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const ok = errorCount === 0;
  const counts: ValidationReportCounts = { error: errorCount, warning: warningCount };
  const packIdField = packId !== undefined ? { packId } : {};

  return {
    ok,
    issues,
    counts,
    ...packIdField,
    toJson(): Readonly<Record<string, unknown>> {
      return { ok, issues, counts, ...packIdField };
    },
  };
}

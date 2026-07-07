// 責務: 検証結果1件分の型（パックスキーマ設計書§4）
export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  readonly ruleId: string;
  readonly severity: ValidationSeverity;
  readonly path: string;
  readonly message: string;
}

export function errorIssue(ruleId: string, path: string, message: string): ValidationIssue {
  return { ruleId, severity: "error", path, message };
}

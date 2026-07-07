// 責務: 評価重み上書きの型（パックスキーマ設計書§2.10）。CR-2の一時状態バフの器
export type AppraisalContext =
  | "不義の目撃"
  | "公衆侮辱"
  | "結義紐帯"
  | "恩義未清算"
  | "制度不信";

export type TemporaryStateKey = "飲酒";

export interface TemporaryStateEffect {
  readonly axisMultipliers: Readonly<Record<string, number>>;
  readonly durationTicks: number;
}

export interface EvaluationOverrides {
  readonly permanent: Readonly<Partial<Record<AppraisalContext, number>>>;
  readonly temporaryStates: Readonly<Partial<Record<TemporaryStateKey, TemporaryStateEffect>>>;
}

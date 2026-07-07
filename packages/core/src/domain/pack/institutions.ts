// 責務: 制度データの型（パックスキーマ設計書§2.4）。処罰規則パラメータに烙印（CR-1）の器を含む
import type { InstitutionId, NodeId, PostId, VocabKey } from "../shared/ids";
import type { Score100 } from "../shared/score100";

export type RuleKind = "課税" | "登用" | "処罰" | "叙勲" | "治安" | "移送";

export interface RuleParam {
  readonly ruleKind: RuleKind;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface PostDef {
  readonly id: PostId;
  readonly nameRef: VocabKey;
  readonly capacity: number;
  readonly salary: number;
  readonly actionTags: readonly string[];
  readonly faceValue: Score100;
}

export interface InstitutionDef {
  readonly id: InstitutionId;
  readonly nameRef: VocabKey;
  readonly jurisdiction: readonly NodeId[] | "全土";
  readonly rules: readonly RuleParam[];
  readonly posts: readonly PostDef[];
  readonly corruption: Score100;
  readonly legitimacy: Score100;
}

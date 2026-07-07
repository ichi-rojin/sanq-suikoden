// 責務: 大義テンプレートの型（パックスキーマ設計書§2.6）
import type { CauseId, VocabKey } from "../shared/ids";

export type HostilityTarget = "制度" | "勢力" | "状態" | "なし";
export type LegitimacyBase = "江湖名声" | "官途名声" | "血統" | "自衛";

export interface CauseTemplate {
  readonly id: CauseId;
  readonly nameRef: VocabKey;
  readonly valueProfile: Readonly<Record<string, number>>;
  readonly hostilityTarget: HostilityTarget;
  readonly legitimacyBase: LegitimacyBase;
}

// 責務: 攪拌テーブルの型（パックスキーマ設計書§2.7）
import type { AgitationId, VocabKey } from "../shared/ids";

export type AgitationKind = "災害" | "収奪" | "政変" | "外圧" | "疫病" | "大赦";

export interface FrequencyBand {
  readonly meanIntervalYears: number;
}

export interface AgitationEntry {
  readonly id: AgitationId;
  readonly kind: AgitationKind;
  readonly nameRef: VocabKey;
  readonly target: string;
  readonly frequencyBand: FrequencyBand;
  readonly intensity: Readonly<Record<string, number>>;
}

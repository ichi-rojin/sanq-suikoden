// 責務: 技データの型（パックスキーマ設計書§2.5）。プリミティブ合成レシピ
import type { SkillId, VocabKey } from "../shared/ids";
import type { Score100 } from "../shared/score100";
import type { AptitudeKey } from "./agents";

export type PrimitiveKind =
  | "投射"
  | "面制圧"
  | "延焼汚染"
  | "地形改変"
  | "恐慌士気"
  | "目標上書き"
  | "隠密偽装"
  | "移動強制"
  | "近接";

export interface SkillComposition {
  readonly primitive: PrimitiveKind;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface SkillAcquisition {
  readonly aptitudeMin?: Readonly<Partial<Record<AptitudeKey, Score100>>>;
  readonly originTag?: VocabKey;
  readonly rarity: string;
}

export interface SkillDef {
  readonly id: SkillId;
  readonly nameRef: VocabKey;
  readonly composition: readonly SkillComposition[];
  readonly witnessTag?: VocabKey | null;
  readonly acquisition: SkillAcquisition;
}

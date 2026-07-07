// 責務: 人物データの型（パックスキーマ設計書§2.3）。RelationKindの4値列挙が白紙原則の構造的強制
import type { AgentId, ArchetypeId, CommunityId, NodeId, PostId, VocabKey } from "../shared/ids";
import type { Score100 } from "../shared/score100";

export interface Aptitudes {
  readonly valor: Score100;
  readonly intellect: Score100;
  readonly leadership: Score100;
  readonly charisma: Score100;
  readonly craft: Score100;
}

export interface Values {
  readonly altruism: Score100;
  readonly loyalty: Score100;
  readonly ambition: Score100;
  readonly acquisition: Score100;
  readonly aggression: Score100;
  readonly caution: Score100;
  readonly face: Score100;
  readonly attachment: Score100;
}

export type AptitudeKey = keyof Aptitudes;
export type ValueAxisKey = keyof Values;

/** 初期関係の種別。白紙原則（運命の白紙原則）により、この4値以外は型として書けない。 */
export type RelationKind = "血縁" | "婚姻" | "師弟" | "同僚";

export interface InitialRelation {
  readonly target: AgentId;
  readonly kind: RelationKind;
  readonly axes: Readonly<Record<string, number>>;
}

export interface ScopedFame {
  readonly community: CommunityId;
  readonly value: Score100;
}

export interface AgentDef {
  readonly id: AgentId;
  readonly familyName: string;
  readonly givenName: string;
  readonly nickname?: VocabKey;
  readonly origin: VocabKey;
  readonly startPost?: PostId;
  readonly startNode: NodeId;
  readonly aptitudes: Aptitudes;
  readonly values: Values;
  readonly initialRelations: readonly InitialRelation[];
  readonly initialAssets: number;
  readonly initialFame: readonly ScopedFame[];
  readonly sourceNote: string;
}

export interface ValueDistribution {
  readonly mean: number;
  readonly stddev: number;
}

export interface ArchetypeDef {
  readonly id: ArchetypeId;
  readonly nameRef: VocabKey;
  readonly valueDistributions: Readonly<Partial<Record<ValueAxisKey, ValueDistribution>>>;
  readonly aptitudeBias: Readonly<Partial<Record<AptitudeKey, number>>>;
  readonly originVocab: VocabKey;
}

export interface GenerationParams {
  readonly initialBackgroundCount: { readonly min: number; readonly max: number };
  readonly successionParams: Readonly<Record<string, unknown>>;
}

export interface Agents {
  readonly explicit: readonly AgentDef[];
  readonly archetypes: readonly ArchetypeDef[];
  readonly generation: GenerationParams;
}

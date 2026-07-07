// 責務: WorldPack型ツリーのルート（パックスキーマ設計書§2.1）。全てreadonlyの不変値オブジェクトツリー
import type { Agents } from "./agents";
import type { AgitationEntry } from "./agitation";
import type { CauseTemplate } from "./causes";
import type { EraParams } from "./era-params";
import type { EvaluationOverrides } from "./evaluation-overrides";
import type { Geography } from "./geography";
import type { InstitutionDef } from "./institutions";
import type { PackMeta } from "./meta";
import type { SkillDef } from "./skills";
import type { Vocabulary } from "./vocabulary";

export interface WorldPack {
  readonly meta: PackMeta;
  readonly geography: Geography;
  readonly agents: Agents;
  readonly institutions: readonly InstitutionDef[];
  readonly skills: readonly SkillDef[];
  readonly causes: readonly CauseTemplate[];
  readonly agitation: readonly AgitationEntry[];
  readonly vocabulary: Vocabulary;
  readonly eraParams: EraParams;
  readonly evaluationOverrides: EvaluationOverrides;
}

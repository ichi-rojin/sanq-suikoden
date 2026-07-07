// 責務: @world/core の公開API（パックスキーマ型・検証器・ロード経路。ledger-frozenの凍結API対象）
export * from "./domain/shared/brand";
export * from "./domain/shared/ids";
export * from "./domain/shared/score100";
export * from "./domain/shared/time";

export type { PackMeta } from "./domain/pack/meta";
export * from "./domain/pack/geography";
export * from "./domain/pack/agents";
export * from "./domain/pack/institutions";
export * from "./domain/pack/skills";
export * from "./domain/pack/causes";
export * from "./domain/pack/agitation";
export * from "./domain/pack/vocabulary";
export * from "./domain/pack/era-params";
export * from "./domain/pack/evaluation-overrides";
export * from "./domain/pack/title-template";
export type { WorldPack } from "./domain/pack/world-pack";

export * from "./domain/event/world-event";
export * from "./domain/event/event-bus";

export * from "./domain/pack/validation/issue";
export * from "./domain/pack/validation/report";
export { StructuralRules } from "./domain/pack/validation/structural-rules";
export { NumericRules } from "./domain/pack/validation/numeric-rules";
export { ConstitutionRules } from "./domain/pack/validation/constitution-rules";
export { BoundaryRules } from "./domain/pack/validation/boundary-rules";
export { PackValidator } from "./domain/pack/validation/pack-validator";

export * from "./application/pack/raw-pack-source";
export * from "./application/pack/pack-repository";
export * from "./application/pack/pack-parser";
export type { LoadPackResult } from "./application/pack/load-pack-use-case";
export { LoadPackUseCase } from "./application/pack/load-pack-use-case";

export { FilePackRepository } from "./infrastructure/pack/file-pack-repository";
export { JsonPackParser } from "./infrastructure/pack/json-pack-parser";

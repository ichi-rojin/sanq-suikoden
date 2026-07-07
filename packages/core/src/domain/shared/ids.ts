// 責務: 境界内の全参照をID化するブランド文字列型と検証付き生成関数（パックスキーマ設計書§0.2-3）
import type { Brand } from "./brand";

export type PackId = Brand<string, "PackId">;
export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;
export type AgentId = Brand<string, "AgentId">;
export type ArchetypeId = Brand<string, "ArchetypeId">;
export type InstitutionId = Brand<string, "InstitutionId">;
export type PostId = Brand<string, "PostId">;
export type SkillId = Brand<string, "SkillId">;
export type CauseId = Brand<string, "CauseId">;
export type AgitationId = Brand<string, "AgitationId">;
export type CommunityId = Brand<string, "CommunityId">;
export type VocabKey = Brand<string, "VocabKey">;

function assertNonBlank(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${label} は空文字にできない`);
  }
}

export function asPackId(value: string): PackId {
  assertNonBlank(value, "PackId");
  return value as PackId;
}

export function asNodeId(value: string): NodeId {
  assertNonBlank(value, "NodeId");
  return value as NodeId;
}

export function asEdgeId(value: string): EdgeId {
  assertNonBlank(value, "EdgeId");
  return value as EdgeId;
}

export function asAgentId(value: string): AgentId {
  assertNonBlank(value, "AgentId");
  return value as AgentId;
}

export function asArchetypeId(value: string): ArchetypeId {
  assertNonBlank(value, "ArchetypeId");
  return value as ArchetypeId;
}

export function asInstitutionId(value: string): InstitutionId {
  assertNonBlank(value, "InstitutionId");
  return value as InstitutionId;
}

export function asPostId(value: string): PostId {
  assertNonBlank(value, "PostId");
  return value as PostId;
}

export function asSkillId(value: string): SkillId {
  assertNonBlank(value, "SkillId");
  return value as SkillId;
}

export function asCauseId(value: string): CauseId {
  assertNonBlank(value, "CauseId");
  return value as CauseId;
}

export function asAgitationId(value: string): AgitationId {
  assertNonBlank(value, "AgitationId");
  return value as AgitationId;
}

export function asCommunityId(value: string): CommunityId {
  assertNonBlank(value, "CommunityId");
  return value as CommunityId;
}

export function asVocabKey(value: string): VocabKey {
  assertNonBlank(value, "VocabKey");
  return value as VocabKey;
}

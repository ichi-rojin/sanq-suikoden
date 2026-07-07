// 責務: 語彙データの型（パックスキーマ設計書§2.8）。TitleTemplateの構文は title-template.ts のパーサが定める
import type { CommunityId, VocabKey } from "../shared/ids";

export type NicknameCategory = "獣身体" | "天象霊獣" | "古人比擬" | "職能誇張" | "性向";

export interface NicknameRule {
  readonly category: NicknameCategory;
  readonly key: string;
  readonly pool: readonly VocabKey[];
}

export interface PersonNames {
  readonly familyPool: readonly string[];
  readonly givenRules: Readonly<Record<string, unknown>>;
}

export interface Nicknames {
  readonly rules: readonly NicknameRule[];
}

export type TitleTemplate = string;

export interface SpeechEntry {
  readonly scene: string;
  readonly personality: string;
  readonly relation: string;
  readonly lines: readonly string[];
}

export interface SpeechTable {
  readonly entries: readonly SpeechEntry[];
}

export interface StyleParam {
  readonly tone: string;
}

export interface CommunityDef {
  readonly id: CommunityId;
  readonly nameRef: VocabKey;
}

export interface Vocabulary {
  readonly personNames: PersonNames;
  readonly nicknames: Nicknames;
  readonly titleTemplates: readonly TitleTemplate[];
  readonly speech: SpeechTable;
  readonly chroniclerStyle: StyleParam;
  readonly displayNames: Readonly<Record<string, string>>;
  readonly communities: readonly CommunityDef[];
  readonly entries: Readonly<Record<VocabKey, string>>;
}

// 責務: 境界検証（パックスキーマ設計書§4-3）。全実体名フィールドが語彙（vocabulary.entries）から
// 禁止リスト生成可能な位置にあることを確認する（固有名詞監査 検出器仕様書§5.1の前提条件）
import { getProp, isArray, isRecord, isString } from "./guards";
import { type ValidationIssue, errorIssue } from "./issue";

function collectVocabEntryKeys(root: Record<string, unknown>): Set<string> | undefined {
  const vocabulary = getProp(root, "vocabulary");
  if (!isRecord(vocabulary)) {
    return undefined;
  }
  const entries = getProp(vocabulary, "entries");
  if (!isRecord(entries)) {
    return undefined;
  }
  return new Set(Object.keys(entries));
}

function checkNameRef(
  record: Record<string, unknown>,
  field: string,
  path: string,
  knownKeys: Set<string>,
  issues: ValidationIssue[],
): void {
  const value = getProp(record, field);
  if (!isString(value)) {
    return;
  }
  if (!knownKeys.has(value)) {
    issues.push(
      errorIssue(
        "boundary/unresolvable-vocab-ref",
        `${path}.${field}`,
        `語彙に存在しない実体名参照であり、固有名詞監査の対象にできない: ${value}`,
      ),
    );
  }
}

function checkArraySection(
  root: Record<string, unknown>,
  section: string,
  fields: readonly string[],
  knownKeys: Set<string>,
): ValidationIssue[] {
  const raw = getProp(root, section);
  const items = isArray(raw) ? raw : [];
  const issues: ValidationIssue[] = [];

  items.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const path = `${section}[${index}]`;
    for (const field of fields) {
      checkNameRef(item, field, path, knownKeys, issues);
    }
  });

  return issues;
}

function checkInstitutions(root: Record<string, unknown>, knownKeys: Set<string>): ValidationIssue[] {
  const issues = checkArraySection(root, "institutions", ["nameRef"], knownKeys);
  const institutionsRaw = getProp(root, "institutions");
  const institutions = isArray(institutionsRaw) ? institutionsRaw : [];

  institutions.forEach((institution, institutionIndex) => {
    if (!isRecord(institution)) {
      return;
    }
    const postsRaw = getProp(institution, "posts");
    const posts = isArray(postsRaw) ? postsRaw : [];
    posts.forEach((post, postIndex) => {
      if (!isRecord(post)) {
        return;
      }
      checkNameRef(post, "nameRef", `institutions[${institutionIndex}].posts[${postIndex}]`, knownKeys, issues);
    });
  });

  return issues;
}

function checkAgents(root: Record<string, unknown>, knownKeys: Set<string>): ValidationIssue[] {
  const agents = getProp(root, "agents");
  if (!isRecord(agents)) {
    return [];
  }
  const issues: ValidationIssue[] = [];

  const explicitRaw = getProp(agents, "explicit");
  const explicit = isArray(explicitRaw) ? explicitRaw : [];
  explicit.forEach((agent, index) => {
    if (!isRecord(agent)) {
      return;
    }
    const path = `agents.explicit[${index}]`;
    checkNameRef(agent, "origin", path, knownKeys, issues);
    if (getProp(agent, "nickname") !== undefined) {
      checkNameRef(agent, "nickname", path, knownKeys, issues);
    }
  });

  const archetypesRaw = getProp(agents, "archetypes");
  const archetypes = isArray(archetypesRaw) ? archetypesRaw : [];
  archetypes.forEach((archetype, index) => {
    if (!isRecord(archetype)) {
      return;
    }
    const path = `agents.archetypes[${index}]`;
    checkNameRef(archetype, "nameRef", path, knownKeys, issues);
    checkNameRef(archetype, "originVocab", path, knownKeys, issues);
  });

  return issues;
}

function checkCommunities(root: Record<string, unknown>, knownKeys: Set<string>): ValidationIssue[] {
  const vocabulary = getProp(root, "vocabulary");
  if (!isRecord(vocabulary)) {
    return [];
  }
  return checkArraySection(vocabulary, "communities", ["nameRef"], knownKeys);
}

export const BoundaryRules = {
  check(candidate: unknown): ValidationIssue[] {
    if (!isRecord(candidate)) {
      return [];
    }
    const knownKeys = collectVocabEntryKeys(candidate);
    if (knownKeys === undefined) {
      return [];
    }
    return [
      ...checkInstitutions(candidate, knownKeys),
      ...checkArraySection(candidate, "skills", ["nameRef"], knownKeys),
      ...checkArraySection(candidate, "causes", ["nameRef"], knownKeys),
      ...checkArraySection(candidate, "agitation", ["nameRef"], knownKeys),
      ...checkAgents(candidate, knownKeys),
      ...checkCommunities(candidate, knownKeys),
    ];
  },
};

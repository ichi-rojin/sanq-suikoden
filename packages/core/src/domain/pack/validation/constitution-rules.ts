// 責務: 憲法検証（パックスキーマ設計書§4-2）。白紙原則・偏在の禁止・S/A層出典注記の存在
import { RELATION_KINDS } from "../agents";
import { getProp, isArray, isRecord, isString } from "./guards";
import { type ValidationIssue, errorIssue } from "./issue";

const ALLOWED_AGENT_KEYS = new Set([
  "id",
  "familyName",
  "givenName",
  "nickname",
  "origin",
  "startPost",
  "startNode",
  "aptitudes",
  "values",
  "initialRelations",
  "initialAssets",
  "initialFame",
  "sourceNote",
]);

const ALLOWED_NODE_KEYS = new Set([
  "id",
  "nodeType",
  "wealth",
  "population",
  "publicOrder",
  "sentiment",
  "enforcement",
  "defense",
  "encounterWeight",
  "regionTag",
]);

function checkUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
  path: string,
): ValidationIssue[] {
  return Object.keys(record)
    .filter((key) => !allowedKeys.has(key))
    .map((key) =>
      errorIssue(
        "constitution/no-special-flags",
        `${path}.${key}`,
        `偏在の禁止: スキーマに存在しないフィールド '${key}' が含まれている`,
      ),
    );
}

function checkExplicitAgents(root: Record<string, unknown>): ValidationIssue[] {
  const agents = getProp(root, "agents");
  if (!isRecord(agents)) {
    return [];
  }
  const explicitRaw = getProp(agents, "explicit");
  const explicit = isArray(explicitRaw) ? explicitRaw : [];
  const issues: ValidationIssue[] = [];

  explicit.forEach((agent, index) => {
    if (!isRecord(agent)) {
      return;
    }
    const path = `agents.explicit[${index}]`;

    issues.push(...checkUnknownKeys(agent, ALLOWED_AGENT_KEYS, path));

    const sourceNote = getProp(agent, "sourceNote");
    if (!isString(sourceNote) || sourceNote.trim().length === 0) {
      issues.push(
        errorIssue("constitution/source-note-required", `${path}.sourceNote`, "S/A層人物の出典注記が存在しない"),
      );
    }

    const relationsRaw = getProp(agent, "initialRelations");
    const relations = isArray(relationsRaw) ? relationsRaw : [];
    relations.forEach((relation, relationIndex) => {
      if (!isRecord(relation)) {
        return;
      }
      const kind = getProp(relation, "kind");
      const isWhitelisted = isString(kind) && (RELATION_KINDS as readonly string[]).includes(kind);
      if (!isWhitelisted) {
        issues.push(
          errorIssue(
            "constitution/relation-whitelist",
            `${path}.initialRelations[${relationIndex}].kind`,
            `初期関係種別 '${String(kind)}' は許可されない（白紙原則）`,
          ),
        );
      }
    });
  });

  return issues;
}

function checkNodes(root: Record<string, unknown>): ValidationIssue[] {
  const geography = getProp(root, "geography");
  if (!isRecord(geography)) {
    return [];
  }
  const nodesRaw = getProp(geography, "nodes");
  const nodes = isArray(nodesRaw) ? nodesRaw : [];
  const issues: ValidationIssue[] = [];

  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      return;
    }
    issues.push(...checkUnknownKeys(node, ALLOWED_NODE_KEYS, `geography.nodes[${index}]`));
  });

  return issues;
}

export class ConstitutionRules {
  check(candidate: unknown): ValidationIssue[] {
    if (!isRecord(candidate)) {
      return [];
    }
    return [...checkExplicitAgents(candidate), ...checkNodes(candidate)];
  }
}

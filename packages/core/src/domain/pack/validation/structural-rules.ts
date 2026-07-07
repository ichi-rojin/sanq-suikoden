// 責務: 構造検証（パックスキーマ設計書§4-1）。必須セクション充足・ID参照解決・ID重複・循環参照
import { parseTitleTemplate } from "../title-template";
import { getProp, isArray, isRecord, isString } from "./guards";
import { type ValidationIssue, errorIssue } from "./issue";

const REQUIRED_SECTIONS = [
  "meta",
  "geography",
  "agents",
  "institutions",
  "skills",
  "causes",
  "agitation",
  "vocabulary",
  "eraParams",
  "evaluationOverrides",
] as const;

const SUPPORTED_ENGINE_SCHEMA_MAJOR = "1";

function checkRequiredSections(root: Record<string, unknown>): ValidationIssue[] {
  return REQUIRED_SECTIONS.filter((section) => !(section in root)).map((section) =>
    errorIssue("structural/required-section", section, `必須セクション '${section}' が存在しない`),
  );
}

function checkEngineSchemaVersion(root: Record<string, unknown>): ValidationIssue[] {
  const meta = getProp(root, "meta");
  if (!isRecord(meta)) {
    return [];
  }
  const version = getProp(meta, "engineSchemaVersion");
  if (!isString(version)) {
    return [
      errorIssue(
        "structural/engine-schema-version",
        "meta.engineSchemaVersion",
        "engineSchemaVersionが文字列でない",
      ),
    ];
  }
  const [major] = version.split(".");
  if (major !== SUPPORTED_ENGINE_SCHEMA_MAJOR) {
    return [
      errorIssue(
        "structural/engine-schema-version",
        "meta.engineSchemaVersion",
        `engineSchemaVersionのmajorがエンジン対応版(${SUPPORTED_ENGINE_SCHEMA_MAJOR})と一致しない: ${version}`,
      ),
    ];
  }
  return [];
}

function collectIds(items: unknown[], path: string): { readonly ids: Set<string>; readonly issues: ValidationIssue[] } {
  const ids = new Set<string>();
  const issues: ValidationIssue[] = [];
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const id = getProp(item, "id");
    if (!isString(id)) {
      return;
    }
    if (ids.has(id)) {
      issues.push(errorIssue("structural/duplicate-id", `${path}[${index}].id`, `IDが重複している: ${id}`));
      return;
    }
    ids.add(id);
  });
  return { ids, issues };
}

interface GeographyCheckResult {
  readonly issues: ValidationIssue[];
  readonly nodeIds: Set<string>;
}

function checkGeography(root: Record<string, unknown>): GeographyCheckResult {
  const geography = getProp(root, "geography");
  if (!isRecord(geography)) {
    return { issues: [], nodeIds: new Set() };
  }
  const nodesRaw = getProp(geography, "nodes");
  const edgesRaw = getProp(geography, "edges");
  const nodes = isArray(nodesRaw) ? nodesRaw : [];
  const edges = isArray(edgesRaw) ? edgesRaw : [];

  const { ids: nodeIds, issues } = collectIds(nodes, "geography.nodes");

  edges.forEach((edge, index) => {
    if (!isRecord(edge)) {
      return;
    }
    const from = getProp(edge, "from");
    const to = getProp(edge, "to");
    if (isString(from) && !nodeIds.has(from)) {
      issues.push(
        errorIssue(
          "structural/dangling-reference",
          `geography.edges[${index}].from`,
          `存在しないノードへの参照: ${from}`,
        ),
      );
    }
    if (isString(to) && !nodeIds.has(to)) {
      issues.push(
        errorIssue(
          "structural/dangling-reference",
          `geography.edges[${index}].to`,
          `存在しないノードへの参照: ${to}`,
        ),
      );
    }
  });

  return { issues, nodeIds };
}

function checkAgents(root: Record<string, unknown>, nodeIds: Set<string>): ValidationIssue[] {
  const agents = getProp(root, "agents");
  if (!isRecord(agents)) {
    return [];
  }
  const explicitRaw = getProp(agents, "explicit");
  const explicit = isArray(explicitRaw) ? explicitRaw : [];
  const { ids: agentIds, issues } = collectIds(explicit, "agents.explicit");

  explicit.forEach((agent, index) => {
    if (!isRecord(agent)) {
      return;
    }
    const path = `agents.explicit[${index}]`;
    const id = getProp(agent, "id");
    const startNode = getProp(agent, "startNode");
    if (isString(startNode) && !nodeIds.has(startNode)) {
      issues.push(
        errorIssue("structural/dangling-reference", `${path}.startNode`, `存在しないノードへの参照: ${startNode}`),
      );
    }

    const relationsRaw = getProp(agent, "initialRelations");
    const relations = isArray(relationsRaw) ? relationsRaw : [];
    relations.forEach((relation, relationIndex) => {
      if (!isRecord(relation)) {
        return;
      }
      const target = getProp(relation, "target");
      const relationPath = `${path}.initialRelations[${relationIndex}].target`;
      if (!isString(target)) {
        return;
      }
      if (isString(id) && target === id) {
        issues.push(
          errorIssue("structural/circular-reference", relationPath, `自分自身への関係参照は許可されない: ${target}`),
        );
        return;
      }
      if (!agentIds.has(target)) {
        issues.push(errorIssue("structural/dangling-reference", relationPath, `存在しない人物への参照: ${target}`));
      }
    });
  });

  return issues;
}

function checkTitleTemplates(root: Record<string, unknown>): ValidationIssue[] {
  const vocabulary = getProp(root, "vocabulary");
  if (!isRecord(vocabulary)) {
    return [];
  }
  const templatesRaw = getProp(vocabulary, "titleTemplates");
  const templates = isArray(templatesRaw) ? templatesRaw : [];
  const issues: ValidationIssue[] = [];

  templates.forEach((template, index) => {
    if (!isString(template)) {
      return;
    }
    const result = parseTitleTemplate(template);
    if (!result.ok) {
      issues.push(
        errorIssue(
          "structural/title-template-syntax",
          `vocabulary.titleTemplates[${index}]`,
          `題テンプレの構文エラー（プレースホルダ置換以外は許可されない）: ${result.error}`,
        ),
      );
    }
  });

  return issues;
}

export class StructuralRules {
  check(candidate: unknown): ValidationIssue[] {
    if (!isRecord(candidate)) {
      return [errorIssue("structural/root-type", "", "パック候補がオブジェクトでない")];
    }

    const geographyResult = checkGeography(candidate);

    return [
      ...checkRequiredSections(candidate),
      ...checkEngineSchemaVersion(candidate),
      ...geographyResult.issues,
      ...checkAgents(candidate, geographyResult.nodeIds),
      ...checkTitleTemplates(candidate),
    ];
  }
}

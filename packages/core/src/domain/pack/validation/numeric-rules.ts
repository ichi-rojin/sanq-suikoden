// 責務: 数値検証（パックスキーマ設計書§4-4）。定義域（0〜100等）と分布パラメータの正値性
import { getProp, isArray, isNumber, isRecord } from "./guards";
import { type ValidationIssue, errorIssue } from "./issue";

const SCORE_MIN = 0;
const SCORE_MAX = 100;

function checkScore100(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = getProp(record, field);
  if (value === undefined) {
    return;
  }
  if (!isNumber(value) || value < SCORE_MIN || value > SCORE_MAX) {
    issues.push(
      errorIssue(
        "numeric/out-of-domain",
        `${path}.${field}`,
        `${SCORE_MIN}〜${SCORE_MAX}の範囲でなければならない: ${String(value)}`,
      ),
    );
  }
}

function checkPositive(record: Record<string, unknown>, field: string, path: string, issues: ValidationIssue[]): void {
  const value = getProp(record, field);
  if (value === undefined) {
    return;
  }
  if (!isNumber(value) || value <= 0) {
    issues.push(
      errorIssue("numeric/non-positive", `${path}.${field}`, `正の数でなければならない: ${String(value)}`),
    );
  }
}

const NODE_SCORE_FIELDS = [
  "wealth",
  "population",
  "publicOrder",
  "sentiment",
  "enforcement",
  "defense",
] as const;
const APTITUDE_FIELDS = ["valor", "intellect", "leadership", "charisma", "craft"] as const;
const VALUE_FIELDS = [
  "altruism",
  "loyalty",
  "ambition",
  "acquisition",
  "aggression",
  "caution",
  "face",
  "attachment",
] as const;

function checkGeography(root: Record<string, unknown>): ValidationIssue[] {
  const geography = getProp(root, "geography");
  if (!isRecord(geography)) {
    return [];
  }
  const issues: ValidationIssue[] = [];

  const nodesRaw = getProp(geography, "nodes");
  const nodes = isArray(nodesRaw) ? nodesRaw : [];
  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      return;
    }
    const path = `geography.nodes[${index}]`;
    for (const field of NODE_SCORE_FIELDS) {
      checkScore100(node, field, path, issues);
    }
  });

  const edgesRaw = getProp(geography, "edges");
  const edges = isArray(edgesRaw) ? edgesRaw : [];
  edges.forEach((edge, index) => {
    if (!isRecord(edge)) {
      return;
    }
    checkPositive(edge, "distance", `geography.edges[${index}]`, issues);
  });

  return issues;
}

function checkAgents(root: Record<string, unknown>): ValidationIssue[] {
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

    const aptitudes = getProp(agent, "aptitudes");
    if (isRecord(aptitudes)) {
      for (const field of APTITUDE_FIELDS) {
        checkScore100(aptitudes, field, `${path}.aptitudes`, issues);
      }
    }

    const values = getProp(agent, "values");
    if (isRecord(values)) {
      for (const field of VALUE_FIELDS) {
        checkScore100(values, field, `${path}.values`, issues);
      }
    }

    const fameRaw = getProp(agent, "initialFame");
    const fame = isArray(fameRaw) ? fameRaw : [];
    fame.forEach((entry, fameIndex) => {
      if (!isRecord(entry)) {
        return;
      }
      checkScore100(entry, "value", `${path}.initialFame[${fameIndex}]`, issues);
    });
  });

  const archetypesRaw = getProp(agents, "archetypes");
  const archetypes = isArray(archetypesRaw) ? archetypesRaw : [];
  archetypes.forEach((archetype, index) => {
    if (!isRecord(archetype)) {
      return;
    }
    const distributions = getProp(archetype, "valueDistributions");
    if (!isRecord(distributions)) {
      return;
    }
    for (const axis of Object.keys(distributions)) {
      const distribution = getProp(distributions, axis);
      if (isRecord(distribution)) {
        checkPositive(distribution, "stddev", `agents.archetypes[${index}].valueDistributions.${axis}`, issues);
      }
    }
  });

  return issues;
}

function checkInstitutions(root: Record<string, unknown>): ValidationIssue[] {
  const institutionsRaw = getProp(root, "institutions");
  const institutions = isArray(institutionsRaw) ? institutionsRaw : [];
  const issues: ValidationIssue[] = [];

  institutions.forEach((institution, index) => {
    if (!isRecord(institution)) {
      return;
    }
    const path = `institutions[${index}]`;
    checkScore100(institution, "corruption", path, issues);
    checkScore100(institution, "legitimacy", path, issues);

    const postsRaw = getProp(institution, "posts");
    const posts = isArray(postsRaw) ? postsRaw : [];
    posts.forEach((post, postIndex) => {
      if (!isRecord(post)) {
        return;
      }
      checkScore100(post, "faceValue", `${path}.posts[${postIndex}]`, issues);
    });
  });

  return issues;
}

function checkEraParams(root: Record<string, unknown>): ValidationIssue[] {
  const eraParams = getProp(root, "eraParams");
  if (!isRecord(eraParams)) {
    return [];
  }
  const lifespan = getProp(eraParams, "lifespan");
  if (!isRecord(lifespan)) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  checkPositive(lifespan, "stddev", "eraParams.lifespan", issues);
  return issues;
}

export const NumericRules = {
  check(candidate: unknown): ValidationIssue[] {
    if (!isRecord(candidate)) {
      return [];
    }
    return [
      ...checkGeography(candidate),
      ...checkAgents(candidate),
      ...checkInstitutions(candidate),
      ...checkEraParams(candidate),
    ];
  },
};

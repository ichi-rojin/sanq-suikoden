// 責務: PackValidatorの拒否ケーステスト（C-10/C-12）。検証4類それぞれについて packs/fixtures/invalid/ の
// 違反フィクスチャが実際に拒否されること、および決定論性（同一入力→同一報告）を確認する
import { describe, expect, it } from "vitest";
import boundaryFixture from "../../../../../../packs/fixtures/invalid/boundary-unresolvable-vocab-ref.json";
import constitutionFixture from "../../../../../../packs/fixtures/invalid/constitution-relation-whitelist.json";
import numericFixture from "../../../../../../packs/fixtures/invalid/numeric-out-of-domain.json";
import structuralFixture from "../../../../../../packs/fixtures/invalid/structural-duplicate-id.json";
import { PackValidator } from "./pack-validator";

const validator = new PackValidator();

function ruleIds(report: ReturnType<typeof validator.validate>): readonly string[] {
  return report.issues.map((issue) => issue.ruleId);
}

const SCORE = 50;

function buildValidPack(): Record<string, unknown> {
  return {
    meta: { packId: "fixtures.valid", packName: "有効パック", version: "0.1.0", engineSchemaVersion: "1.0" },
    geography: {
      nodes: [
        {
          id: "node.a",
          nodeType: "県城",
          wealth: SCORE,
          population: SCORE,
          publicOrder: SCORE,
          sentiment: SCORE,
          enforcement: SCORE,
          defense: SCORE,
          encounterWeight: 1,
          regionTag: "east",
        },
      ],
      edges: [],
    },
    agents: {
      explicit: [
        {
          id: "agent.a",
          familyName: "石",
          givenName: "堅",
          origin: "vocab.origin.soldier",
          startNode: "node.a",
          aptitudes: { valor: SCORE, intellect: SCORE, leadership: SCORE, charisma: SCORE, craft: SCORE },
          values: {
            altruism: SCORE,
            loyalty: SCORE,
            ambition: SCORE,
            acquisition: SCORE,
            aggression: SCORE,
            caution: SCORE,
            face: SCORE,
            attachment: SCORE,
          },
          initialRelations: [],
          initialAssets: 0,
          initialFame: [],
          sourceNote: "架空",
        },
      ],
      archetypes: [],
      generation: { initialBackgroundCount: { min: 1, max: 1 }, successionParams: {} },
    },
    institutions: [],
    skills: [],
    causes: [],
    agitation: [],
    vocabulary: {
      personNames: { familyPool: [], givenRules: {} },
      nicknames: { rules: [] },
      titleTemplates: [],
      speech: { entries: [] },
      chroniclerStyle: { tone: "plain" },
      displayNames: {},
      communities: [],
      entries: { "vocab.origin.soldier": "兵卒" },
    },
    eraParams: {
      lifespan: { mean: 55, stddev: 12 },
      moveSpeed: { foot: 1, horse: 3, boat: 2 },
      currency: "貫",
      banquetFrequency: 1,
    },
    evaluationOverrides: { permanent: {}, temporaryStates: {} },
  };
}

describe("PackValidator rejection cases", () => {
  it("rejects duplicate node ids (structural)", () => {
    const report = validator.validate(structuralFixture);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("structural/duplicate-id");
  });

  it("rejects a non-whitelisted relation kind (constitution)", () => {
    const report = validator.validate(constitutionFixture);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("constitution/relation-whitelist");
  });

  it("rejects a name reference unresolvable via vocabulary.entries (boundary)", () => {
    const report = validator.validate(boundaryFixture);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("boundary/unresolvable-vocab-ref");
  });

  it("rejects an out-of-domain numeric value (numeric)", () => {
    const report = validator.validate(numericFixture);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("numeric/out-of-domain");
  });

  it("is deterministic: the same input yields the same report twice", () => {
    const first = validator.validate(structuralFixture);
    const second = validator.validate(structuralFixture);
    expect(first.toJson()).toEqual(second.toJson());
  });

  it("rejects an S/A layer agent missing sourceNote", () => {
    const pack = buildValidPack();
    const agents = pack["agents"] as { explicit: Array<Record<string, unknown>> };
    delete agents.explicit[0]?.sourceNote;

    const report = validator.validate(pack);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("constitution/source-note-required");
  });

  it("rejects an engineSchemaVersion major mismatch", () => {
    const pack = buildValidPack();
    const meta = pack["meta"] as Record<string, unknown>;
    meta["engineSchemaVersion"] = "2.0";

    const report = validator.validate(pack);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("structural/engine-schema-version");
  });

  it("rejects a title template containing conditional-looking syntax", () => {
    const pack = buildValidPack();
    const vocabulary = pack["vocabulary"] as Record<string, unknown>;
    vocabulary["titleTemplates"] = ["{a==b}"];

    const report = validator.validate(pack);
    expect(report.ok).toBe(false);
    expect(ruleIds(report)).toContain("structural/title-template-syntax");
  });
});

describe("PackValidator acceptance case", () => {
  it("accepts a fully valid pack (no false positives)", () => {
    const report = validator.validate(buildValidPack());
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

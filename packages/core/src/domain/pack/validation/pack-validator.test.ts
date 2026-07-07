// 責務: PackValidatorの拒否ケーステスト（C-10）。検証4類それぞれについて packs/fixtures/invalid/ の
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
});

describe("PackValidator acceptance case", () => {
  it("accepts a fully valid pack (no false positives)", () => {
    const score = 50;
    const validPack = {
      meta: { packId: "fixtures.valid", packName: "有効パック", version: "0.1.0", engineSchemaVersion: "1.0" },
      geography: {
        nodes: [
          {
            id: "node.a",
            nodeType: "県城",
            wealth: score,
            population: score,
            publicOrder: score,
            sentiment: score,
            enforcement: score,
            defense: score,
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
            aptitudes: { valor: score, intellect: score, leadership: score, charisma: score, craft: score },
            values: {
              altruism: score,
              loyalty: score,
              ambition: score,
              acquisition: score,
              aggression: score,
              caution: score,
              face: score,
              attachment: score,
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

    const report = validator.validate(validPack);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

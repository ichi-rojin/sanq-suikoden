// 責務: 人物データ型の形状テスト（C-07）。RelationKindが4値列挙であることを型・実行時の両方で確認する
import { describe, expect, it } from "vitest";
import { asAgentId, asNodeId, asVocabKey } from "../shared/ids";
import { asScore100 } from "../shared/score100";
import type { AgentDef, InitialRelation, RelationKind } from "./agents";

describe("RelationKind", () => {
  it("accepts exactly the 4 whitelisted values", () => {
    const kinds: readonly RelationKind[] = ["血縁", "婚姻", "師弟", "同僚"];
    expect(kinds).toContain("血縁");
    expect(kinds).toContain("婚姻");
    expect(kinds).toContain("師弟");
    expect(kinds).toContain("同僚");
  });

  it("rejects any value outside the whitelist at compile time", () => {
    // @ts-expect-error 白紙原則: ホワイトリスト外の種別（怨恨等）は型として存在しない
    const invalid: RelationKind = "怨恨";
    expect(invalid).toBeDefined();
  });
});

describe("AgentDef shape", () => {
  it("constructs a full AgentDef consistent with the schema", () => {
    const axisValue = 60;
    const assetValue = 20;

    const relation: InitialRelation = {
      target: asAgentId("agent.reed"),
      kind: "同僚",
      axes: { affection: axisValue, trust: axisValue },
    };

    const agent: AgentDef = {
      id: asAgentId("agent.stone"),
      familyName: "石",
      givenName: "堅",
      origin: asVocabKey("vocab.origin.soldier"),
      startNode: asNodeId("node.riverfort"),
      aptitudes: {
        valor: asScore100(axisValue),
        intellect: asScore100(axisValue),
        leadership: asScore100(axisValue),
        charisma: asScore100(axisValue),
        craft: asScore100(axisValue),
      },
      values: {
        altruism: asScore100(axisValue),
        loyalty: asScore100(axisValue),
        ambition: asScore100(axisValue),
        acquisition: asScore100(axisValue),
        aggression: asScore100(axisValue),
        caution: asScore100(axisValue),
        face: asScore100(axisValue),
        attachment: asScore100(axisValue),
      },
      initialRelations: [relation],
      initialAssets: assetValue,
      initialFame: [],
      sourceNote: "架空。形状テスト用",
    };

    expect(agent.initialRelations).toContain(relation);
  });
});

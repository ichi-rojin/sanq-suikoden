// 責務: 地理データ型の形状テスト（C-07）
import { describe, expect, it } from "vitest";
import { asEdgeId, asNodeId } from "../shared/ids";
import { asScore100 } from "../shared/score100";
import type { EdgeDef, Geography, NodeDef } from "./geography";

describe("geography shapes", () => {
  it("constructs a NodeDef and EdgeDef consistent with the schema", () => {
    const statValue = 40;
    const encounterWeight = 1;
    const distance = 2;

    const node: NodeDef = {
      id: asNodeId("node.riverfort"),
      nodeType: "県城",
      wealth: asScore100(statValue),
      population: asScore100(statValue),
      publicOrder: asScore100(statValue),
      sentiment: asScore100(statValue),
      enforcement: asScore100(statValue),
      defense: asScore100(statValue),
      encounterWeight,
      regionTag: "east",
    };
    const edge: EdgeDef = {
      id: asEdgeId("edge.e1"),
      from: node.id,
      to: node.id,
      kind: "幹線",
      distance,
    };
    const geography: Geography = { nodes: [node], edges: [edge] };

    expect(geography.nodes).toContain(node);
    expect(geography.edges).toContain(edge);
  });
});

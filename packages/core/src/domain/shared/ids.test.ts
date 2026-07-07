// 責務: ブランドID生成関数の域外拒否テスト（C-06）
import { describe, expect, it } from "vitest";
import { asAgentId, asNodeId, asPackId } from "./ids";

describe("id factories", () => {
  it("accepts non-blank strings", () => {
    const id = "node.riverfort";
    expect(asNodeId(id)).toBe(id);
  });

  it("rejects blank strings", () => {
    const empty = "";
    const whitespace = "   ";
    expect(() => asNodeId(empty)).toThrow(RangeError);
    expect(() => asNodeId(whitespace)).toThrow(RangeError);
  });

  it("keeps distinct constructors for distinct id kinds", () => {
    const agentId = "agent.stone";
    const packId = "fixtures.mini";
    expect(asAgentId(agentId)).toBe(agentId);
    expect(asPackId(packId)).toBe(packId);
  });
});

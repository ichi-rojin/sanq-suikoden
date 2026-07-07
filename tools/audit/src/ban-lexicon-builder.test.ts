// 責務: BanLexiconBuilderの生成テスト（C-13）。ミニパックから既知のトークン数が生成されることを確認する
import type { WorldPack } from "@world/core";
import { describe, expect, it } from "vitest";
import miniPackJson from "../../../packs/fixtures/mini/pack.json";
import { BanLexiconBuilder } from "./ban-lexicon-builder";

const miniPack = miniPackJson as unknown as WorldPack;

describe("BanLexiconBuilder", () => {
  it("builds a lexicon with the known token count from the mini pack", () => {
    const builder = new BanLexiconBuilder();
    const lexicon = builder.build([miniPack]);

    const expectedTokenCount = 16;
    expect(lexicon.entries).toHaveLength(expectedTokenCount);
    expect(lexicon.has("岩塊")).toBe(true);
    expect(lexicon.has("県府")).toBe(true);
    expect(lexicon.has("石")).toBe(true);
    expect(lexicon.has("該当なし")).toBe(false);
  });
});

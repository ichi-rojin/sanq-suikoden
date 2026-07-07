// 責務: 題テンプレ構文解析の形状・拒否テスト（C-08）。プレースホルダ置換以外の構文を拒否することを確認する
import { describe, expect, it } from "vitest";
import { parseTitleTemplate } from "./title-template";

describe("parseTitleTemplate", () => {
  it("accepts placeholder substitution and literal alternation", () => {
    const result = parseTitleTemplate("{地名}の{戦い|乱|変}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segments).toEqual([
        { kind: "placeholder", name: "地名" },
        { kind: "literal", text: "の" },
        { kind: "alternation", options: ["戦い", "乱", "変"] },
      ]);
    }
  });

  it("rejects unmatched opening brace", () => {
    const result = parseTitleTemplate("{地名の乱");
    expect(result.ok).toBe(false);
  });

  it("rejects stray closing brace", () => {
    const result = parseTitleTemplate("地名}の乱");
    expect(result.ok).toBe(false);
  });

  it("rejects nested placeholders", () => {
    const result = parseTitleTemplate("{地名{国}}の乱");
    expect(result.ok).toBe(false);
  });

  it("rejects conditional-looking syntax", () => {
    expect(parseTitleTemplate("{a==b}").ok).toBe(false);
    expect(parseTitleTemplate("{a+b}").ok).toBe(false);
    expect(parseTitleTemplate("{a?b:c}").ok).toBe(false);
  });

  it("rejects empty placeholders", () => {
    expect(parseTitleTemplate("{}").ok).toBe(false);
    expect(parseTitleTemplate("{地名|}").ok).toBe(false);
  });
});

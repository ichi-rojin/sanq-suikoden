// 責務: JsonPackParserのパース失敗→Issue変換テスト（C-11）
import { describe, expect, it } from "vitest";
import { JsonPackParser } from "./json-pack-parser";

describe("JsonPackParser", () => {
  it("parses valid JSON into a candidate", () => {
    const parser = new JsonPackParser();
    const result = parser.parse({ text: '{"a":1}', origin: "test" });
    expect(result.candidate).toEqual({ a: 1 });
    expect(result.issues).toEqual([]);
  });

  it("converts a JSON syntax error into a ValidationIssue", () => {
    const parser = new JsonPackParser();
    const result = parser.parse({ text: "{not valid json", origin: "test.json" });
    expect(result.candidate).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.ruleId).toBe("structural/json-syntax");
  });
});

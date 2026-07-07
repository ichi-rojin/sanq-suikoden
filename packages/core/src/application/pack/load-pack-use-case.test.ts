// 責務: LoadPackUseCaseの編成テスト（C-11）。パース失敗時・検証失敗時にWorldPackを返さないことを確認する
import { describe, expect, it } from "vitest";
import { PackValidator } from "../../domain/pack/validation/pack-validator";
import { LoadPackUseCase } from "./load-pack-use-case";
import type { PackParser, ParseResult } from "./pack-parser";
import type { PackRepository } from "./pack-repository";
import type { RawPackSource } from "./raw-pack-source";

class FakeRepository implements PackRepository {
  constructor(private readonly source: RawPackSource) {}

  async load(): Promise<RawPackSource> {
    return this.source;
  }
}

class FakeParser implements PackParser {
  constructor(private readonly result: ParseResult) {}

  parse(): ParseResult {
    return this.result;
  }
}

describe("LoadPackUseCase", () => {
  it("does not return a pack when parsing fails", async () => {
    const useCase = new LoadPackUseCase(
      new FakeRepository({ text: "", origin: "x" }),
      new FakeParser({
        issues: [{ ruleId: "structural/json-syntax", severity: "error", path: "x", message: "bad" }],
      }),
      new PackValidator(),
    );

    const result = await useCase.execute("dummy");

    expect(result.pack).toBeUndefined();
    expect(result.report.ok).toBe(false);
  });

  it("does not return a pack when schema validation fails", async () => {
    const useCase = new LoadPackUseCase(
      new FakeRepository({ text: "{}", origin: "x" }),
      new FakeParser({ candidate: {}, issues: [] }),
      new PackValidator(),
    );

    const result = await useCase.execute("dummy");

    expect(result.pack).toBeUndefined();
    expect(result.report.ok).toBe(false);
  });
});

// 責務: ValidatePackCommandの終了コードテスト（C-12）
import type { LoadPackResult, LoadPackUseCase } from "@world/core";
import { describe, expect, it } from "vitest";
import { ValidatePackCommand } from "./validate-pack";

function fakeUseCase(result: LoadPackResult): LoadPackUseCase {
  return {
    execute: async () => result,
  } as unknown as LoadPackUseCase;
}

describe("ValidatePackCommand", () => {
  it("returns exit code 0 when the report is ok", async () => {
    const command = new ValidatePackCommand(
      fakeUseCase({ report: { ok: true, issues: [], counts: { error: 0, warning: 0 }, toJson: () => ({}) } }),
    );
    const exitCode = await command.run("packs/fixtures/mini");
    expect(exitCode).toBe(0);
  });

  it("returns exit code 1 when the report has issues", async () => {
    const command = new ValidatePackCommand(
      fakeUseCase({
        report: {
          ok: false,
          issues: [{ ruleId: "x", severity: "error", path: "y", message: "z" }],
          counts: { error: 1, warning: 0 },
          toJson: () => ({}),
        },
      }),
    );
    const exitCode = await command.run("packs/fixtures/mini");
    expect(exitCode).toBe(1);
  });
});

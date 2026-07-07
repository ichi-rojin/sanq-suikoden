// 責務: validate-packコマンドのE2E確認（C-12）。実際の配線でミニパックがok=0になることを確認する
import { FilePackRepository, JsonPackParser, LoadPackUseCase, PackValidator } from "@world/core";
import { describe, expect, it } from "vitest";
import { ValidatePackCommand } from "./commands/validate-pack";

describe("validate-pack E2E", () => {
  it("exits 0 for the mini fixture pack", async () => {
    const useCase = new LoadPackUseCase(new FilePackRepository(), new JsonPackParser(), new PackValidator());
    const command = new ValidatePackCommand(useCase);
    const exitCode = await command.run("packs/fixtures/mini");
    expect(exitCode).toBe(0);
  });
});

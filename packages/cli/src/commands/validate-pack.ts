// 責務: validate-packコマンド。実行→報告整形→終了コード（ok=0 / issues=1）
import type { LoadPackUseCase } from "@world/core";

const EXIT_OK = 0;
const EXIT_ISSUES = 1;
const JSON_INDENT = 2;

export class ValidatePackCommand {
  constructor(private readonly useCase: LoadPackUseCase) {}

  async run(dir: string): Promise<number> {
    const result = await this.useCase.execute(dir);
    process.stdout.write(`${JSON.stringify(result.report.toJson(), null, JSON_INDENT)}\n`);
    return result.report.ok ? EXIT_OK : EXIT_ISSUES;
  }
}

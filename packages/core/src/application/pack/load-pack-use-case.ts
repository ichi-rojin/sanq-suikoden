// 責務: パックの取得→パース→検証を編成するユースケース。検証失敗時はWorldPackを返さない
import type { PackValidator } from "../../domain/pack/validation/pack-validator";
import { type ValidationReport, createValidationReport } from "../../domain/pack/validation/report";
import type { WorldPack } from "../../domain/pack/world-pack";
import type { PackParser } from "./pack-parser";
import type { PackRepository } from "./pack-repository";

export interface LoadPackResult {
  readonly pack?: WorldPack;
  readonly report: ValidationReport;
}

export class LoadPackUseCase {
  constructor(
    private readonly repository: PackRepository,
    private readonly parser: PackParser,
    private readonly validator: PackValidator,
  ) {}

  async execute(source: string): Promise<LoadPackResult> {
    const raw = await this.repository.load(source);
    const parseResult = this.parser.parse(raw);

    if (parseResult.candidate === undefined) {
      return { report: createValidationReport(undefined, parseResult.issues) };
    }

    const report = this.validator.validate(parseResult.candidate);
    if (!report.ok) {
      return { report };
    }

    return { pack: parseResult.candidate as WorldPack, report };
  }
}

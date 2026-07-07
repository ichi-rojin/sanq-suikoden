// 責務: Composition Root。全レイヤの配線と引数分岐はここでのみ行う
import { FilePackRepository, JsonPackParser, LoadPackUseCase, PackValidator } from "@world/core";
import { ValidatePackCommand } from "./commands/validate-pack";

const EXIT_USAGE_ERROR = 1;
const EXIT_UNKNOWN_COMMAND = 1;
const ARGV_OFFSET = 2;

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "validate-pack") {
    const [dir] = rest;
    if (dir === undefined) {
      process.stderr.write("使い方: validate-pack <dir>\n");
      return EXIT_USAGE_ERROR;
    }
    const useCase = new LoadPackUseCase(new FilePackRepository(), new JsonPackParser(), new PackValidator());
    const validatePackCommand = new ValidatePackCommand(useCase);
    return validatePackCommand.run(dir);
  }

  process.stderr.write(`未知のコマンド: ${String(command)}\n`);
  return EXIT_UNKNOWN_COMMAND;
}

const exitCode = await main(process.argv.slice(ARGV_OFFSET));
process.exit(exitCode);

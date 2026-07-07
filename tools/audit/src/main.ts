// 責務: 固有名詞監査CLI。走査→報告→終了コード（検出ゼロ=0、検出あり=非ゼロ）。verify.shから呼ぶ
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FilePackRepository, JsonPackParser, LoadPackUseCase, PackValidator } from "@world/core";
import { BanLexiconBuilder } from "./ban-lexicon-builder";
import { type AuditHit, SourceScanner } from "./source-scanner";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const JSON_INDENT = 2;
const ARGV_OFFSET = 2;

const SCAN_ROOT = "packages";
const EXCLUDED_PACKAGE_DIRS = new Set(["viewer"]);
const TEST_FILE_SUFFIX = ".test.ts";
const SOURCE_FILE_SUFFIX = ".ts";
const DEFAULT_PACK_DIR = "packs/fixtures/mini";

export interface AuditReport {
  readonly ok: boolean;
  readonly lexiconSize: number;
  readonly hits: readonly AuditHit[];
  toJson(): Readonly<Record<string, unknown>>;
}

export function createAuditReport(lexiconSize: number, hits: readonly AuditHit[]): AuditReport {
  const ok = hits.length === 0;
  return {
    ok,
    lexiconSize,
    hits,
    toJson(): Readonly<Record<string, unknown>> {
      return { ok, lexiconSize, hits };
    },
  };
}

function walk(dir: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.name.endsWith(SOURCE_FILE_SUFFIX) && !entry.name.endsWith(TEST_FILE_SUFFIX)) {
      files.push(fullPath);
    }
  }
}

export function collectSourceFiles(root: string): string[] {
  const packageDirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED_PACKAGE_DIRS.has(entry.name))
    .map((entry) => join(root, entry.name, "src"));

  const files: string[] = [];
  for (const packageDir of packageDirs) {
    walk(packageDir, files);
  }
  return files;
}

export async function auditMain(argv: readonly string[]): Promise<number> {
  const packDir = argv[0] ?? DEFAULT_PACK_DIR;

  const loadResult = await new LoadPackUseCase(
    new FilePackRepository(),
    new JsonPackParser(),
    new PackValidator(),
  ).execute(packDir);

  if (loadResult.pack === undefined) {
    process.stderr.write("監査対象パックの検証に失敗した。validate-packを先に実行せよ。\n");
    return EXIT_FAILURE;
  }

  const lexicon = new BanLexiconBuilder().build([loadResult.pack]);
  const files = collectSourceFiles(SCAN_ROOT);
  const hits = new SourceScanner(lexicon).scan(files);
  const report = createAuditReport(lexicon.entries.length, hits);

  process.stdout.write(`${JSON.stringify(report.toJson(), null, JSON_INDENT)}\n`);
  return report.ok ? EXIT_OK : EXIT_FAILURE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await auditMain(process.argv.slice(ARGV_OFFSET));
  process.exit(exitCode);
}

// 責務: SourceScannerの照合テストと混入自己試験（C-14）
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BanLexicon } from "./ban-lexicon-builder";
import { SourceScanner } from "./source-scanner";

const lexicon = new BanLexicon([
  { token: "岩塊", sourcePack: "fixtures.mini", sourcePath: "vocabulary.entries.vocab.nick.rock" },
]);

describe("SourceScanner.scanText", () => {
  const scanner = new SourceScanner(lexicon);

  it("detects a banned token inside a line comment", () => {
    const hits = scanner.scanText("a.ts", "// 岩塊について\nconst x = 1;\n");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.context).toBe("comment");
    expect(hits[0]?.line).toBe(1);
  });

  it("detects a banned token inside a string literal", () => {
    const hits = scanner.scanText("a.ts", 'const msg = "岩塊だ";\n');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.context).toBe("string");
  });

  it("detects a banned token used as a whole identifier", () => {
    const hits = scanner.scanText("a.ts", "const 岩塊 = 1;\n");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.context).toBe("identifier");
  });

  it("does not flag unrelated code", () => {
    const hits = scanner.scanText("a.ts", "// 責務: 通常のコメント\nexport const value = 1;\n");
    expect(hits).toHaveLength(0);
  });
});

describe("SourceScanner contamination self-test", () => {
  it("detects a mini-pack vocabulary word planted in a temporary file, then removes it", () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-self-test-"));
    const filePath = join(dir, "contaminated.ts");
    writeFileSync(filePath, "// 岩塊が混入した一時ファイル\n", "utf-8");

    try {
      const scanner = new SourceScanner(lexicon);
      const hits = scanner.scan([filePath]);
      expect(hits.some((hit) => hit.token === "岩塊")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 責務: auditMainの結線・除外規則テスト（C-15）
import { describe, expect, it } from "vitest";
import { auditMain, collectSourceFiles, createAuditReport } from "./main";

describe("collectSourceFiles", () => {
  it("excludes packages/viewer/src and test files", () => {
    const files = collectSourceFiles("packages");
    expect(files.some((file) => file.includes("viewer/src"))).toBe(false);
    expect(files.some((file) => file.endsWith(".test.ts"))).toBe(false);
    expect(files.some((file) => file.endsWith("index.ts"))).toBe(true);
  });
});

describe("createAuditReport", () => {
  const lexiconSize = 10;

  it("is ok when there are no hits", () => {
    const report = createAuditReport(lexiconSize, []);
    expect(report.ok).toBe(true);
  });

  it("is not ok when there is at least one hit", () => {
    const report = createAuditReport(lexiconSize, [{ file: "x.ts", line: 1, token: "t", context: "identifier" }]);
    expect(report.ok).toBe(false);
  });
});

describe("auditMain", () => {
  it("exits 0 for the current clean codebase", async () => {
    const exitCode = await auditMain(["packs/fixtures/mini"]);
    expect(exitCode).toBe(0);
  });
});

// 責務: vitest動作確認用サンプルテスト（C-05）
import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@world/core placeholder", () => {
  it("loads without throwing", () => {
    expect(core).toBeDefined();
  });
});

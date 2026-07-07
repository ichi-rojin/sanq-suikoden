// 責務: Score100の域外拒否テスト（C-06）
import { describe, expect, it } from "vitest";
import { asScore100 } from "./score100";

describe("asScore100", () => {
  const min = 0;
  const max = 100;

  it("accepts values within the domain", () => {
    expect(asScore100(min)).toBe(min);
    expect(asScore100(max)).toBe(max);
  });

  it("rejects values outside the domain", () => {
    const belowMin = min - 1;
    const aboveMax = max + 1;
    expect(() => asScore100(belowMin)).toThrow(RangeError);
    expect(() => asScore100(aboveMax)).toThrow(RangeError);
  });
});

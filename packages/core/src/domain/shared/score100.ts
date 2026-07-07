// 責務: 0〜100の定義域付き数値ブランド型（素質・価値観・腐敗度・正統性等が共有する型）
import type { Brand } from "./brand";

export type Score100 = Brand<number, "Score100">;

const MIN_SCORE = 0;
const MAX_SCORE = 100;

export function asScore100(value: number): Score100 {
  if (!Number.isFinite(value) || value < MIN_SCORE || value > MAX_SCORE) {
    throw new RangeError(
      `Score100は${MIN_SCORE}〜${MAX_SCORE}の範囲でなければならない: ${value}`,
    );
  }
  return value as Score100;
}

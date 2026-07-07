// 責務: 時代パラメータの型（パックスキーマ設計書§2.9）。全て数値パラメータのみ
export interface LifespanParams {
  readonly mean: number;
  readonly stddev: number;
}

export interface MoveSpeedParams {
  readonly foot: number;
  readonly horse: number;
  readonly boat: number;
}

export interface EraParams {
  readonly lifespan: LifespanParams;
  readonly moveSpeed: MoveSpeedParams;
  readonly currency: string;
  readonly banquetFrequency: number;
}

// 責務: パック原文取得を抽象化するインターフェース（実装はinfrastructure/pack）
import type { RawPackSource } from "./raw-pack-source";

export interface PackRepository {
  load(source: string): Promise<RawPackSource>;
}

// 責務: パックメタ情報の型（パックスキーマ設計書§2.1）
import type { PackId } from "../shared/ids";

export interface PackMeta {
  readonly packId: PackId;
  readonly packName: string;
  readonly version: string;
  readonly engineSchemaVersion: string;
  readonly sourceNote?: string;
}

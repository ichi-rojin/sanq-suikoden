// 責務: イベント配送インターフェース（世界設計書§14.3）。M0は型のみ。配送規律の実装はM1
import type { WorldEvent } from "./world-event";

export interface EventBus {
  publish(event: WorldEvent): void;
  subscribe(type: string, handler: (event: WorldEvent) => void): void;
}

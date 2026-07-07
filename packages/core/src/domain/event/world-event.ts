// 責務: 全イベントの共通形状（世界設計書§13.3の転写）。M0は型定義のみで発火・配送は実装しない
import type { AgentId, NodeId } from "../shared/ids";
import type { Score100 } from "../shared/score100";
import type { EventId, Tick } from "../shared/time";

export interface WorldEvent {
  readonly id: EventId;
  readonly tick: Tick;
  readonly type: string;
  readonly actors: readonly AgentId[];
  readonly witnesses: readonly AgentId[];
  readonly location: NodeId;
  readonly causes: readonly EventId[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly salience: Score100;
}

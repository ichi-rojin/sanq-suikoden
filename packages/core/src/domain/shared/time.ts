// 責務: 時間・イベント識別のブランド型（M0は型予約のみ。生成関数は持たない）
import type { Brand } from "./brand";

export type Tick = Brand<number, "Tick">;
export type EventId = Brand<string, "EventId">;

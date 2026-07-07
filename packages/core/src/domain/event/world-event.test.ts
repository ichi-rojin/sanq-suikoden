// 責務: WorldEvent封筒型とEventBusインターフェースの形状テスト（C-09）。実装コードはゼロ
import { describe, expect, it } from "vitest";
import { asAgentId, asNodeId } from "../shared/ids";
import { asScore100 } from "../shared/score100";
import type { EventId, Tick } from "../shared/time";
import type { EventBus } from "./event-bus";
import type { WorldEvent } from "./world-event";

describe("WorldEvent shape", () => {
  it("constructs an envelope consistent with the schema", () => {
    const tickValue = 4520;
    const salienceValue = 60;

    const event: WorldEvent = {
      id: "evt.000123" as EventId,
      tick: tickValue as Tick,
      type: "（G11ラウンドで正式化）",
      actors: [asAgentId("agent.stone")],
      witnesses: [asAgentId("agent.reed")],
      location: asNodeId("node.ferry"),
      causes: ["evt.000098" as EventId],
      payload: {},
      salience: asScore100(salienceValue),
    };

    expect(event.actors).toContain(asAgentId("agent.stone"));
  });
});

describe("EventBus shape", () => {
  it("accepts a minimal conforming implementation (shape only, no dispatch semantics)", () => {
    const handlers = new Map<string, Array<(event: WorldEvent) => void>>();
    const bus: EventBus = {
      publish(): void {
        // 責務外: 配送規律の実装はM1
      },
      subscribe(type, handler): void {
        const existing = handlers.get(type) ?? [];
        handlers.set(type, [...existing, handler]);
      },
    };

    expect(typeof bus.publish).toBe("function");
    expect(typeof bus.subscribe).toBe("function");
  });
});

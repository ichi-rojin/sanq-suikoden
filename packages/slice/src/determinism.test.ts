// 責務: Vertical Sliceの決定論スモークテスト。同一シードは同一の歴史を生む（凍結原則: 決定論）
import { describe, expect, it } from "vitest";
import { OFFICER_SEEDS } from "../data/officers.data";
import { createNameRegistry } from "../data/text.data";
import { EDGE_SEEDS, EXILE_DESTINATION, FACTION_SEEDS, PLACE_SEEDS } from "../data/world.data";
import type { World } from "./model";
import { buildWorld, runYears } from "./sim";

function simulate(seed: number, years: number): World {
  const names = createNameRegistry(OFFICER_SEEDS, FACTION_SEEDS, PLACE_SEEDS);
  const world = buildWorld(seed, {
    officers: OFFICER_SEEDS,
    factions: FACTION_SEEDS,
    places: PLACE_SEEDS,
    edges: EDGE_SEEDS,
    exileDest: EXILE_DESTINATION,
  });
  runYears(world, names, years);
  return world;
}

function fingerprint(world: World): string {
  return world.events.map((e) => `${e.tick}:${e.kind}:${e.actors.join(",")}`).join("|");
}

describe("vertical slice world simulation", () => {
  it("同一シードから同一の歴史が生まれる（決定論）", () => {
    const a = simulate(42, 6);
    const b = simulate(42, 6);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("世界は出来事を生み続け、勢力の興亡が起きる", () => {
    const world = simulate(42, 12);
    expect(world.events.length).toBeGreaterThan(100);
    const kinds = new Set(world.events.map((e) => e.kind));
    // 核となる4体験: 群雄の戦争・怨恨か義盟・勢力の転落か勃興・冤罪または出奔
    expect(kinds.has("war.battle")).toBe(true);
    expect(
      kinds.has("life.oath") || kinds.has("life.quarrel") || kinds.has("clash.stray"),
    ).toBe(true);
    expect(
      kinds.has("faction.fall") || kinds.has("faction.lair") || kinds.has("faction.rise"),
    ).toBe(true);
    expect(kinds.has("life.frame") || kinds.has("life.defect")).toBe(true);
  });
});

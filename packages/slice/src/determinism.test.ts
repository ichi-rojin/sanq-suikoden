// 責務: Vertical Sliceの決定論スモークテスト。同一シードは同一の歴史を生む（凍結原則: 決定論）
// 裁定R-17: 併せてタイル世界の構造保証（街道の連結・河の壁・技の世界作用）を検める
import { describe, expect, it } from "vitest";
import { OFFICER_SEEDS } from "../data/officers.data";
import { createNameRegistry } from "../data/text.data";
import {
  COAST_POINTS,
  DESERT_POINTS,
  EDGE_SEEDS,
  EXILE_DESTINATION,
  FACTION_SEEDS,
  GEO_FEATURES,
  GRID_H,
  GRID_W,
  PLACE_SEEDS,
} from "../data/world.data";
import { T, findTilePath } from "./grid";
import type { World } from "./model";
import { placePos } from "./model";
import { buildWorld, runYears } from "./sim";

function makeWorld(seed: number): World {
  return buildWorld(seed, {
    gridW: GRID_W,
    gridH: GRID_H,
    officers: OFFICER_SEEDS,
    factions: FACTION_SEEDS,
    places: PLACE_SEEDS,
    edges: EDGE_SEEDS,
    geo: GEO_FEATURES,
    coast: COAST_POINTS,
    desert: DESERT_POINTS,
    exileDest: EXILE_DESTINATION,
  });
}

function simulate(seed: number, years: number): World {
  const names = createNameRegistry(OFFICER_SEEDS, FACTION_SEEDS, PLACE_SEEDS);
  const world = makeWorld(seed);
  runYears(world, names, years);
  return world;
}

function fingerprint(world: World): string {
  return world.events.map((e) => `${e.tick}:${e.kind}:${e.actors.join(",")}`).join("|");
}

describe("tile world structure", () => {
  it("全拠点が街道網で互いに到達できる（河は壁、渡し場と関が扉）", () => {
    const world = makeWorld(1);
    const from = placePos(world, "kaifeng");
    for (const place of world.places.values()) {
      const path = findTilePath(world.grid, from, placePos(world, place.id));
      expect(path, `開封→${place.id} が到達不能`).toBeDefined();
    }
  });

  it("世界は数万セルのタイルで構成され、主要地形が全て存在する", () => {
    const world = makeWorld(1);
    expect(world.grid.terrain.length).toBe(GRID_W * GRID_H);
    const seen = new Set<number>();
    for (const t of world.grid.terrain) {
      seen.add(t);
    }
    for (const t of [T.plain, T.road, T.forest, T.mountain, T.river, T.ford, T.marsh, T.sea, T.city, T.wall, T.gate, T.hill]) {
      expect(seen.has(t), `地形コード${t}が世界に存在しない`).toBe(true);
    }
  });
});

describe("vertical slice world simulation", () => {
  it("同一シードから同一の歴史が生まれる（決定論）", () => {
    const a = simulate(42, 3);
    const b = simulate(42, 3);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("世界は出来事を生み続け、勢力の興亡が起きる", () => {
    const world = simulate(42, 6);
    expect(world.events.length).toBeGreaterThan(100);
    const kinds = new Set(world.events.map((e) => e.kind));
    // 核となる4体験: 群雄の戦争・怨恨か義盟・勢力の転落か勃興・冤罪または出奔
    expect(kinds.has("war.encounter") || kinds.has("war.siege")).toBe(true);
    expect(
      kinds.has("life.oath") || kinds.has("life.quarrel") || kinds.has("clash.stray"),
    ).toBe(true);
    expect(
      kinds.has("faction.fall") || kinds.has("faction.lair") || kinds.has("faction.rise"),
    ).toBe(true);
    expect(kinds.has("life.frame") || kinds.has("life.defect")).toBe(true);
  });

  it("技は世界へ作用し、傷跡（焼け跡・瓦礫・亡骸）が地図に残る", () => {
    const world = simulate(42, 6);
    const scarred = world.grid.scars.size > 0 ||
      world.corpses.length > 0 ||
      [...world.places.values()].some((p) => p.devastation > 0);
    expect(scarred).toBe(true);
  });
});

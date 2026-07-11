// 責務: 世界の組み立てと日次ループの編成。プレイヤー無しで世界が回り続けることがこの層の検収条件
// 裁定R-17: tickは1日。火は毎日燃え広がり、軍は毎日一歩ずつ進み、人生の節目は月次、勢力の戦略は四半期で刻む
import { collectDramas } from "./drama";
import { detectBattles, stepBattles, stepFires, stepVolleys } from "./field";
import type { GeoFeatureLike } from "./grid";
import { T, buildGrid } from "./grid";
import type { BondKind, Faction, NameRegistry, Officer, Place, World } from "./model";
import { DAYS_PER_MONTH, DAYS_PER_YEAR } from "./model";
import { stepJourneys, stepPersonalLives } from "./personal";
import { Rng } from "./rng";
import {
  runFactionStrategies,
  stepAgitation,
  stepArmies,
  stepConvoys,
  stepPrisons,
  stepRoamingBands,
  stepSuccessions,
} from "./strategy";

export interface OfficerSeedLike {
  id: string;
  age: number;
  apt: Officer["aptitudes"];
  val: Officer["values"];
  skills: Officer["skills"];
  startNode: string;
  faction?: string;
  fameOfficial: number;
  fameOutlaw: number;
  relations: Array<{ target: string; affinity: number; trust: number; bond?: BondKind }>;
}

export interface FactionSeedLike {
  id: string;
  kind: Faction["kind"];
  leader: string;
  cities: string[];
  loc?: string;
  gold: number;
  policy: Faction["policy"];
  corruption: number;
  legitimacy: number;
}

export interface PlaceSeedLike {
  id: string;
  kind: Place["kind"];
  gridX: number;
  gridY: number;
  wealth: number;
  population: number;
  order: number;
  sentiment: number;
  defense: number;
  garrison: number;
  owner?: string;
  terrainForest: number;
  terrainCliff: number;
  terrainWater: number;
}

export interface WorldSeed {
  gridW: number;
  gridH: number;
  officers: OfficerSeedLike[];
  factions: FactionSeedLike[];
  places: PlaceSeedLike[];
  edges: Array<{ from: string; to: string }>;
  geo: GeoFeatureLike[];
  coast: Array<[number, number]>;
  desert: Array<[number, number]>;
  exileDest: string;
}

const WINDS: Array<{ x: number; y: number }> = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 },
];

export function buildWorld(seed: number, worldSeed: WorldSeed): World {
  const rng = new Rng(seed);
  const built = buildGrid({
    w: worldSeed.gridW,
    h: worldSeed.gridH,
    geo: worldSeed.geo,
    coast: worldSeed.coast,
    desert: worldSeed.desert,
    places: worldSeed.places.map((p) => ({ id: p.id, kind: p.kind, x: p.gridX, y: p.gridY })),
    edges: worldSeed.edges,
  });

  const world: World = {
    tick: 0,
    rng,
    grid: built.grid,
    walls: built.walls,
    cityTiles: new Map(),
    wind: rng.pick(WINDS),
    exileDest: worldSeed.exileDest,
    officers: new Map(),
    factions: new Map(),
    places: new Map(),
    edges: worldSeed.edges.map((e) => ({ ...e })),
    armies: [],
    convoys: [],
    battles: [],
    volleys: [],
    corpses: [],
    events: [],
    dramas: [],
    counters: new Map(),
  };

  for (const p of worldSeed.places) {
    const place: Place = {
      id: p.id,
      kind: p.kind,
      gridX: p.gridX,
      gridY: p.gridY,
      wealth: p.wealth,
      population: p.population,
      order: p.order,
      sentiment: p.sentiment,
      defense: p.defense,
      garrison: p.garrison,
      devastation: 0,
      gateHp: p.defense * 3,
      gateBroken: false,
      terrainForest: p.terrainForest,
      terrainCliff: p.terrainCliff,
      terrainWater: p.terrainWater,
      ...(p.owner !== undefined ? { owner: p.owner } : {}),
    };
    world.places.set(place.id, place);
    // 敷地タイル → 拠点の帰属（延焼・攻城の判定に使う）
    const walled = world.walls.get(place.id);
    const radius = walled !== undefined ? (p.kind === "capital" ? 2 : 1) : 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = p.gridX + dx;
        const y = p.gridY + dy;
        if (world.grid.inBounds(x, y)) {
          world.cityTiles.set(world.grid.idx(x, y), place.id);
        }
      }
    }
  }

  for (const f of worldSeed.factions) {
    const faction: Faction = {
      id: f.id,
      kind: f.kind,
      leader: f.leader,
      members: [],
      cities: [...f.cities],
      gold: f.gold,
      policy: f.policy,
      corruption: f.corruption,
      legitimacy: f.legitimacy,
      feud: new Map(),
      foundedTick: 0,
      ...(f.loc !== undefined ? { loc: f.loc } : {}),
    };
    world.factions.set(faction.id, faction);
  }

  for (const seedOfficer of worldSeed.officers) {
    const start = world.places.get(seedOfficer.startNode);
    const officer: Officer = {
      id: seedOfficer.id,
      age: seedOfficer.age,
      aptitudes: { ...seedOfficer.apt },
      values: { ...seedOfficer.val },
      skills: [...seedOfficer.skills],
      hp: 100,
      status: seedOfficer.faction !== undefined ? "serving" : "free",
      loc: seedOfficer.startNode,
      homeLoc: seedOfficer.startNode,
      pos: { x: start?.gridX ?? 0, y: start?.gridY ?? 0 },
      fameOfficial: seedOfficer.fameOfficial,
      fameOutlaw: seedOfficer.fameOutlaw,
      gold: 20,
      rel: new Map(),
      memory: [],
      ...(seedOfficer.faction !== undefined ? { factionId: seedOfficer.faction } : {}),
    };
    world.officers.set(officer.id, officer);
    if (seedOfficer.faction !== undefined) {
      world.factions.get(seedOfficer.faction)?.members.push(officer.id);
    }
  }

  // 初期関係は双方向に張る
  for (const seedOfficer of worldSeed.officers) {
    const officer = world.officers.get(seedOfficer.id);
    if (officer === undefined) {
      continue;
    }
    for (const rel of seedOfficer.relations) {
      const other = world.officers.get(rel.target);
      if (other === undefined) {
        continue;
      }
      officer.rel.set(rel.target, {
        affinity: rel.affinity,
        trust: rel.trust,
        grudges: [],
        debts: [],
        ...(rel.bond !== undefined ? { bond: rel.bond } : {}),
      });
      if (!other.rel.has(officer.id)) {
        other.rel.set(officer.id, {
          affinity: rel.affinity,
          trust: rel.trust,
          grudges: [],
          debts: [],
          ...(rel.bond !== undefined ? { bond: rel.bond } : {}),
        });
      }
    }
  }

  return world;
}

// 月次: 世情の揺り戻しと城門の繕い
function monthlyRecovery(world: World): void {
  for (const place of world.places.values()) {
    place.order = Math.min(100, place.order + (place.order < 50 ? 0.4 : 0));
    place.sentiment = Math.min(100, place.sentiment + (place.sentiment < 50 ? 0.3 : 0));
    // 主ある城市は徴募で兵が戻る（軍を失っても世界は止まらない）
    const isCity =
      place.kind === "capital" || place.kind === "county" || place.kind === "manor" || place.kind === "town";
    if (place.owner !== undefined && isCity) {
      place.garrison = Math.min(place.population * 30, place.garrison + place.population * 0.6);
    }
    // 破れた城門は、戦火が去れば繕われる
    const underSiege = world.battles.some((b) => b.placeId === place.id);
    if (place.gateBroken && !underSiege && place.owner !== undefined && world.rng.chance(0.6)) {
      place.gateBroken = false;
      place.gateHp = place.defense * 3;
      const walls = world.walls.get(place.id);
      if (walls !== undefined) {
        for (const gate of walls.gates) {
          if (world.grid.at(gate.x, gate.y) === T.burnt) {
            world.grid.set(gate.x, gate.y, T.gate);
          }
        }
      }
    }
  }
  world.grid.healScars(world.tick);
}

// 日次tick: 火と矢 → 交戦 → 行軍 → 護送 → 旅人 →（月次）人生と世情 →（四半期）勢力戦略
export function stepDay(world: World, names: NameRegistry): void {
  stepFires(world);
  stepVolleys(world);
  detectBattles(world, names);
  stepBattles(world, names);
  stepArmies(world, names);
  stepConvoys(world, names);
  stepJourneys(world);

  if (world.tick % DAYS_PER_MONTH === 0) {
    world.wind = world.rng.pick(WINDS);
    stepAgitation(world);
    stepRoamingBands(world, names);
    stepPersonalLives(world, names);
    stepPrisons(world);
    stepSuccessions(world, names);
    monthlyRecovery(world);
  }
  if (world.tick % (DAYS_PER_MONTH * 3) === 0) {
    runFactionStrategies(world, names);
  }

  world.tick += 1;
}

// 日次tickを回し、起きた出来事から小窓ドラマも編む（Viewer向けの便宜）
export function stepDayWithDramas(world: World, names: NameRegistry): void {
  const evStart = world.events.length;
  stepDay(world, names);
  collectDramas(world, world.events.slice(evStart));
}

export function runYears(world: World, names: NameRegistry, years: number): void {
  const days = years * DAYS_PER_YEAR;
  for (let i = 0; i < days; i += 1) {
    stepDay(world, names);
  }
}

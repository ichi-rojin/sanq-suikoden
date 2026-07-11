// 責務: 世界の組み立てと月次ループの編成。プレイヤー無しで世界が回り続けることがこの層の検収条件
import type { BondKind, Faction, NameRegistry, Officer, Place, World } from "./model";
import { MONTHS_PER_YEAR } from "./model";
import { stepPersonalLives } from "./personal";
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
  officers: OfficerSeedLike[];
  factions: FactionSeedLike[];
  places: PlaceSeedLike[];
  edges: Array<{ from: string; to: string }>;
  exileDest: string;
}

export function buildWorld(seed: number, worldSeed: WorldSeed): World {
  const world: World = {
    tick: 0,
    rng: new Rng(seed),
    exileDest: worldSeed.exileDest,
    officers: new Map(),
    factions: new Map(),
    places: new Map(),
    edges: worldSeed.edges.map((e) => ({ ...e })),
    armies: [],
    convoys: [],
    events: [],
    replays: [],
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
      terrainForest: p.terrainForest,
      terrainCliff: p.terrainCliff,
      terrainWater: p.terrainWater,
      ...(p.owner !== undefined ? { owner: p.owner } : {}),
    };
    world.places.set(place.id, place);
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

// 月次tick: 天災→(四半期)勢力戦略→行軍・会戦→護送→獄→放浪の一党→個人の人生→継承→世情の揺り戻し
export function stepMonth(world: World, names: NameRegistry): void {
  stepAgitation(world);
  if (world.tick % 3 === 0) {
    runFactionStrategies(world, names);
  }
  stepArmies(world, names);
  stepConvoys(world, names);
  stepPrisons(world);
  stepRoamingBands(world, names);
  stepPersonalLives(world, names);
  stepSuccessions(world, names);

  for (const place of world.places.values()) {
    place.order = Math.min(100, place.order + (place.order < 50 ? 0.4 : 0));
    place.sentiment = Math.min(100, place.sentiment + (place.sentiment < 50 ? 0.3 : 0));
    // 主ある城市は徴募で兵が戻る（軍を失っても世界は止まらない）
    const isCity =
      place.kind === "capital" || place.kind === "county" || place.kind === "manor" || place.kind === "town";
    if (place.owner !== undefined && isCity) {
      place.garrison = Math.min(place.population * 30, place.garrison + place.population * 0.6);
    }
  }
  world.tick += 1;
}

export function runYears(world: World, names: NameRegistry, years: number): void {
  const months = years * MONTHS_PER_YEAR;
  for (let i = 0; i < months; i += 1) {
    stepMonth(world, names);
  }
}

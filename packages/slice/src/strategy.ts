// 責務: 勢力AI。方針決定→任務（侵攻・討伐・護送・収奪）→軍の逐次行軍→勢力の興亡（滅亡は消滅ではなく放浪への転落）
// 交戦そのものはfield.ts（世界が戦場）が、落城・捕虜などの帰結はfate.tsが裁く
import { emit } from "./events";
import { disbandArmy, killOfficer, occupyPlace } from "./fate";
import { isSealedGate, makeUnits, moveArmyAlongPath } from "./field";
import type { TileCostFn, XY } from "./grid";
import { T, chebyshev, findTilePath, moveCostOf } from "./grid";
import type {
  Army,
  EventId,
  Faction,
  NameRegistry,
  Officer,
  Place,
  World,
} from "./model";
import {
  armyOfficerIds,
  factionOf,
  factionStrength,
  getRelation,
  livingOfficers,
  neighborsOf,
  nextId,
  placePos,
  powerOf,
} from "./model";

const ARMY_SPEED = 0.75; // 兵站を引きずる軍の1日移動力
const CONVOY_SPEED = 0.4; // 枷をはめられた護送の足取り

function membersOf(world: World, faction: Faction): Officer[] {
  return faction.members
    .map((id) => world.officers.get(id))
    .filter((o): o is Officer => o !== undefined && o.status !== "dead");
}

function fieldedMembers(world: World, faction: Faction): Officer[] {
  const inArmies = new Set(world.armies.flatMap((a) => armyOfficerIds(a)));
  return membersOf(world, faction).filter(
    (o) => o.status === "serving" || o.status === "roaming",
  ).filter((o) => !inArmies.has(o.id));
}

// 軍の行軍経路: 敵の城内は避ける（門は主の兵しか通さない）
export function armyPathTo(world: World, factionId: string, from: XY, to: XY): XY[] | undefined {
  const costFn: TileCostFn = (t, x, y) => {
    if (t === T.gate && isSealedGate(world, x, y, factionId)) {
      return Number.POSITIVE_INFINITY;
    }
    if (t === T.city || t === T.gate) {
      const owner = world.cityTiles.get(world.grid.idx(x, y));
      if (owner !== undefined) {
        const place = world.places.get(owner);
        if (place?.owner !== undefined && place.owner !== factionId) {
          return moveCostOf(t) * 8; // 敵地の城下は避けて通る
        }
      }
    }
    return moveCostOf(t);
  };
  return findTilePath(world.grid, from, to, costFn);
}

// ---- 世界の揺らぎ: 天災と収奪（月次） ----
export function stepAgitation(world: World): void {
  const rng = world.rng;
  if (rng.chance(0.03)) {
    const place = rng.pick(
      [...world.places.values()].filter((p) => p.kind !== "pass" && p.kind !== "port"),
    );
    place.wealth = Math.max(5, place.wealth - 12);
    place.sentiment = Math.max(0, place.sentiment - 12);
    emit(world, {
      kind: "agit.disaster",
      loc: place.id,
      data: { calamity: rng.pick(["flood", "locust", "drought"]) },
    });
  }
}

// ---- 勢力の四半期戦略 ----
export function runFactionStrategies(world: World, names: NameRegistry): void {
  for (const faction of [...world.factions.values()]) {
    if (faction.fallenTick !== undefined) {
      continue;
    }
    // 遺恨は時とともに薄れる（薄れなければ世界は消耗戦だけになる）
    for (const [fid, heat] of faction.feud) {
      faction.feud.set(fid, Math.max(0, heat - 4));
    }
    // 政の腐敗は頭領の器を映す（義人が立てば粛正され、貪官が立てば腐る）
    const chief = world.officers.get(faction.leader);
    if (chief !== undefined) {
      faction.corruption += (100 - chief.values.altruism - faction.corruption) * 0.08;
      faction.corruption = Math.max(5, Math.min(95, faction.corruption));
    }
    const leader = world.officers.get(faction.leader);
    if (leader === undefined || leader.status === "dead") {
      continue;
    }
    switch (faction.kind) {
      case "court":
        courtStrategy(world, faction, leader);
        break;
      case "warlord":
      case "manor":
        lordStrategy(world, faction, leader);
        break;
      case "outlaw":
        outlawStrategy(world, faction, leader);
        break;
      default:
        break;
    }
  }
  void names;
}

function courtStrategy(world: World, faction: Faction, leader: Officer): void {
  const rng = world.rng;

  // 収奪: 腐敗した政庁は民から搾り取る（民心と義士の心が離れる）
  if (rng.chance(faction.corruption / 100 * 0.5) && faction.cities.length > 0) {
    const cityId = rng.pick(faction.cities);
    const city = world.places.get(cityId);
    if (city !== undefined) {
      city.sentiment = Math.max(0, city.sentiment - 8);
      city.order = Math.max(0, city.order - 4);
      faction.gold += Math.floor(city.wealth * 3);
      emit(world, {
        kind: "agit.extortion",
        loc: cityId,
        factions: [faction.id],
        data: { leader: leader.id },
      });
    }
  }

  // 讒訴と冤罪: 名声高き義士は腐敗の標的になる（逼上梁山の仕掛け）
  if (rng.chance(faction.corruption / 100 * 0.4)) {
    const villains = membersOf(world, faction).filter(
      (o) => o.values.acquisition >= 70 && o.values.altruism <= 30 && o.status === "serving",
    );
    const targets = membersOf(world, faction).filter(
      (o) =>
        o.status === "serving" &&
        o.id !== faction.leader &&
        o.values.altruism >= 55 &&
        o.fameOfficial + o.fameOutlaw >= 55,
    );
    if (villains.length > 0 && targets.length > 0) {
      const orderer = rng.pick(villains);
      const victim = rng.pickWeighted(targets, (t) => t.fameOfficial + t.fameOutlaw);
      const frameEvent = emit(world, {
        kind: "life.frame",
        loc: victim.loc,
        actors: [orderer.id, victim.id],
        factions: [faction.id],
        data: { orderer: orderer.id, victim: victim.id },
      });
      victim.status = "prisoner";
      delete victim.factionId;
      delete victim.journey;
      faction.members = faction.members.filter((m) => m !== victim.id);
      victim.fameOfficial = Math.max(0, victim.fameOfficial - 20);
      const dest = world.exileDest;
      const path = findTilePath(world.grid, victim.pos, placePos(world, dest)) ?? [];
      const convoyEvent = emit(world, {
        kind: "life.convoy",
        loc: victim.loc,
        actors: [victim.id],
        factions: [faction.id],
        causes: [frameEvent.id],
        data: { prisoner: victim.id, dest },
      });
      world.convoys.push({
        prisoner: victim.id,
        x: victim.pos.x,
        y: victim.pos.y,
        path,
        mp: 0,
        dest,
        escortFactionId: faction.id,
        causeEvent: convoyEvent.id,
      });
    }
  }

  // 奪回: 城を奪った相手への遺恨が深ければ、兵を挙げて取り返しに行く
  const vendetta = [...faction.feud.entries()]
    .filter(([fid, heat]) => {
      const enemy = world.factions.get(fid);
      return heat >= 50 && enemy !== undefined && enemy.fallenTick === undefined && enemy.cities.length > 0;
    })
    .sort((a, b) => b[1] - a[1])[0];
  if (vendetta !== undefined && world.armies.every((a) => a.factionId !== faction.id) && rng.chance(0.45)) {
    const enemy = world.factions.get(vendetta[0]);
    if (enemy !== undefined && factionStrength(world, faction) > factionStrength(world, enemy) * 1.15) {
      const weakest = enemy.cities
        .map((c) => world.places.get(c))
        .filter((p): p is Place => p !== undefined)
        .sort((a, b) => a.garrison + a.defense * 8 - (b.garrison + b.defense * 8))[0];
      if (weakest !== undefined) {
        faction.policy = "expand";
        launchArmy(world, faction, weakest.id, "invade");
        return;
      }
    }
  }

  // 討伐: 緑林の勢いが閾を越えたら兵を出す（弾圧がさらに義士を野に追う）
  const outlaws = [...world.factions.values()].filter(
    (f) =>
      (f.kind === "outlaw" || (f.kind === "warlord" && f.legitimacy < 40)) &&
      f.fallenTick === undefined &&
      f.cities.length > 0,
  );
  const strongest = outlaws.sort((a, b) => factionStrength(world, b) - factionStrength(world, a))[0];
  if (
    strongest !== undefined &&
    factionStrength(world, strongest) > 1400 &&
    world.armies.every((a) => a.factionId !== faction.id) &&
    rng.chance(0.35)
  ) {
    faction.policy = "suppress";
    emit(world, {
      kind: "faction.crackdown",
      factions: [faction.id],
      actors: [leader.id],
      data: { leader: leader.id },
    });
    launchArmy(world, faction, strongest.cities[0] ?? "", "suppress");
  } else {
    faction.policy = "develop";
    for (const cityId of faction.cities) {
      const city = world.places.get(cityId);
      if (city !== undefined) {
        city.garrison = Math.min(city.population * 40, city.garrison + Math.floor(city.population * 1.5));
      }
    }
  }
}

function lordStrategy(world: World, faction: Faction, leader: Officer): void {
  const rng = world.rng;
  // 遺恨のある隣人へ攻めかかる。なければ守りと蓄え
  const feuds = [...faction.feud.entries()]
    .filter(([fid, heat]) => heat >= 40 && world.factions.get(fid)?.fallenTick === undefined)
    .sort((a, b) => b[1] - a[1]);
  const targetEntry = feuds[0];
  if (targetEntry !== undefined && world.armies.every((a) => a.factionId !== faction.id)) {
    const enemy = world.factions.get(targetEntry[0]);
    if (enemy !== undefined) {
      const targetPlace = enemy.cities[0] ?? enemy.loc;
      if (
        targetPlace !== undefined &&
        factionStrength(world, faction) > factionStrength(world, enemy) * 1.1 &&
        rng.chance(0.6)
      ) {
        faction.policy = "expand";
        launchArmy(world, faction, targetPlace, "invade");
        return;
      }
    }
  }
  // 野心と血気が領主を戦へ駆り立てる
  if (
    world.armies.every((a) => a.factionId !== faction.id) &&
    rng.chance((leader.values.ambition + leader.values.aggression) / 350)
  ) {
    const adjacencies = faction.cities.flatMap((c) => neighborsOf(world, c));
    const candidates = adjacencies
      .map((pid) => world.places.get(pid))
      .filter((p): p is Place => p !== undefined && p.owner !== faction.id)
      .filter((p) => p.kind === "county" || p.kind === "town" || p.kind === "manor");
    const weakest = candidates.sort((a, b) => a.garrison + a.defense - (b.garrison + b.defense))[0];
    if (weakest !== undefined && factionStrength(world, faction) > (weakest.garrison + weakest.defense * 10) * 1.3) {
      faction.policy = "expand";
      launchArmy(world, faction, weakest.id, "invade");
      return;
    }
  }
  faction.policy = "defend";
  for (const cityId of faction.cities) {
    const city = world.places.get(cityId);
    if (city !== undefined) {
      city.garrison = Math.min(city.population * 45, city.garrison + Math.floor(city.population * 1.2));
    }
  }
}

function outlawStrategy(world: World, faction: Faction, leader: Officer): void {
  const rng = world.rng;
  const lair = faction.cities[0] !== undefined ? world.places.get(faction.cities[0]) : undefined;
  if (lair === undefined) {
    return;
  }
  // 力が満ちれば城市を奪って天下に名乗る
  const adjacencies = neighborsOf(world, lair.id)
    .map((pid) => world.places.get(pid))
    .filter((p): p is Place => p !== undefined && p.owner !== faction.id)
    .filter((p) => p.kind === "county" || p.kind === "capital" || p.kind === "manor" || p.kind === "town");
  const weakest = adjacencies.sort((a, b) => a.garrison + a.defense * 8 - (b.garrison + b.defense * 8))[0];
  if (
    weakest !== undefined &&
    factionStrength(world, faction) > (weakest.garrison + weakest.defense * 8) * 1.35 &&
    leader.values.ambition + leader.values.aggression >= 90 &&
    world.armies.every((a) => a.factionId !== faction.id) &&
    rng.chance(0.5)
  ) {
    faction.policy = "expand";
    launchArmy(world, faction, weakest.id, "invade");
    return;
  }
  // 日銭は劫掠から。近郷を荒らして遺恨を積む
  if (rng.chance(0.5) && adjacencies.length > 0) {
    faction.policy = "raid";
    const target = rng.pick(adjacencies);
    const ownerFaction = target.owner !== undefined ? world.factions.get(target.owner) : undefined;
    faction.gold += Math.floor(target.wealth * 2);
    target.sentiment = Math.max(0, target.sentiment - 4);
    target.order = Math.max(0, target.order - 5);
    for (const member of membersOf(world, faction).slice(0, 3)) {
      member.fameOutlaw = Math.min(100, member.fameOutlaw + 2);
    }
    if (ownerFaction !== undefined) {
      ownerFaction.feud.set(faction.id, (ownerFaction.feud.get(faction.id) ?? 0) + 15);
      faction.feud.set(ownerFaction.id, (faction.feud.get(ownerFaction.id) ?? 0) + 5);
    }
    emit(world, {
      kind: "war.raid",
      loc: target.id,
      factions: [faction.id],
      actors: [leader.id],
      data: {},
    });
  } else {
    faction.policy = "recruit";
    lair.garrison = Math.min(3000, lair.garrison + 40 + Math.floor(faction.gold / 100));
  }
}

// ---- 放浪の一党（月次判断・日次の歩みはstepJourneysが担う） ----
export function stepRoamingBands(world: World, names: NameRegistry): void {
  for (const faction of [...world.factions.values()]) {
    if (faction.fallenTick !== undefined || faction.kind !== "roaming") {
      continue;
    }
    const leader = world.officers.get(faction.leader);
    if (leader === undefined || leader.status === "dead") {
      continue;
    }
    roamingStrategy(world, faction, leader, names);
  }
}

function roamingStrategy(world: World, faction: Faction, leader: Officer, names: NameRegistry): void {
  const loc = faction.loc ?? leader.loc;
  const here = world.places.get(loc);
  const members = membersOf(world, faction);
  const arrived = leader.journey === undefined;

  // 要害に着いていて頭数が揃えば山寨を開く
  if (
    arrived &&
    here !== undefined &&
    (here.kind === "lairsite" || here.kind === "marsh") &&
    (here.owner === undefined || here.owner === faction.id) &&
    members.length >= 3
  ) {
    faction.kind = "outlaw";
    faction.cities = [here.id];
    here.owner = faction.id;
    here.garrison = Math.max(here.garrison, members.length * 50);
    delete faction.loc;
    names.registerLair(faction.id, here.id, world.tick);
    emit(world, {
      kind: "faction.lair",
      loc: here.id,
      actors: members.map((m) => m.id),
      factions: [faction.id],
      data: { leader: leader.id },
    });
    return;
  }

  // 空いた要害を目指す。空きが無ければ、頭数が揃い次第よその山寨を乗っ取りに行く
  faction.policy = "seeklair";
  const freeLairs = [...world.places.values()].filter(
    (p) => (p.kind === "lairsite" || p.kind === "marsh") && (p.owner === undefined || p.owner === faction.id),
  );
  let goal: Place | undefined;
  if (freeLairs.length > 0) {
    let best = Number.POSITIVE_INFINITY;
    for (const t of freeLairs) {
      const d = chebyshev(leader.pos, { x: t.gridX, y: t.gridY });
      if (d < best) {
        best = d;
        goal = t;
      }
    }
  } else if (members.length >= 3) {
    goal = [...world.places.values()]
      .filter((p) => (p.kind === "lairsite" || p.kind === "marsh") && p.owner !== faction.id)
      .sort((a, b) => a.garrison - b.garrison)[0];
  }

  if (goal === undefined) {
    return;
  }

  // よその山寨の門前に立ったなら、力ずくで奪う（軍を興し、世界の戦場で決着させる）
  if (arrived && loc === goal.id && goal.owner !== undefined && goal.owner !== faction.id) {
    bandAssault(world, faction, goal);
    return;
  }

  // 頭領が旅立てば、一党は連れ立って歩む（日次の歩みはstepJourneysで）
  if (arrived && loc !== goal.id) {
    const path = findTilePath(world.grid, leader.pos, { x: goal.gridX, y: goal.gridY });
    if (path !== undefined && path.length > 0) {
      leader.journey = { path, dest: goal.id, mp: 0, speed: 0.9 };
      faction.loc = goal.id;
    }
  }
}

// 放浪の一党による山寨の乗っ取り。体ひとつの殴り込みが世界の戦場になる
function bandAssault(world: World, faction: Faction, place: Place): void {
  const members = membersOf(world, faction).filter((o) => o.status !== "prisoner").slice(0, 6);
  if (members.length === 0) {
    return;
  }
  if (world.armies.some((a) => a.factionId === faction.id)) {
    return;
  }
  const declare = emit(world, {
    kind: "war.declare",
    loc: place.id,
    at: { x: place.gridX, y: place.gridY },
    actors: members.map((m) => m.id),
    factions: [faction.id, place.owner ?? ""],
    data: { target: place.id, troops: members.length * 80 },
  });
  world.armies.push({
    id: nextId(world, "a"),
    factionId: faction.id,
    units: makeUnits(members, members.length * 80),
    x: members[0]?.pos.x ?? place.gridX,
    y: members[0]?.pos.y ?? place.gridY,
    mp: 0,
    path: [],
    trail: [],
    target: place.id,
    goal: "invade",
    state: "march",
    causeEvent: declare.id,
  });
}

// ---- 軍の編成と進発 ----
function launchArmy(world: World, faction: Faction, target: string, goal: Army["goal"]): void {
  if (target === "") {
    return;
  }
  const candidates = fieldedMembers(world, faction)
    .filter((o) => o.id !== faction.leader || faction.kind === "outlaw" || faction.kind === "roaming")
    .filter((o) => o.journey === undefined)
    .sort((a, b) => powerOf(b) - powerOf(a));
  const officers = candidates.slice(0, 5);
  if (officers.length === 0) {
    return;
  }
  const source = faction.cities
    .map((c) => world.places.get(c))
    .filter((p): p is Place => p !== undefined)
    .sort((a, b) => b.garrison - a.garrison)[0];
  if (source === undefined) {
    return;
  }
  const troops = Math.min(2000, Math.floor(source.garrison * 0.65));
  if (troops < 250) {
    return;
  }
  const from = placePos(world, source.id);
  const to = placePos(world, target);
  const path = armyPathTo(world, faction.id, from, to);
  if (path === undefined) {
    return; // 道が無ければ兵は出せない（山河が戦略を規定する）
  }
  source.garrison -= troops;
  const declare = emit(world, {
    kind: "war.declare",
    loc: source.id,
    at: from,
    actors: officers.map((o) => o.id),
    factions: [faction.id, world.places.get(target)?.owner ?? ""],
    data: { target, troops, warId: nextId(world, "w") },
  });
  for (const o of officers) {
    o.loc = source.id;
    o.pos = { ...from };
    delete o.journey;
  }
  world.armies.push({
    id: nextId(world, "a"),
    factionId: faction.id,
    units: makeUnits(officers, troops),
    x: from.x,
    y: from.y,
    mp: 0,
    path,
    trail: [],
    target,
    goal,
    state: "march",
    causeEvent: declare.id,
  });
}

// ---- 軍の行軍（日次）。交戦はfield.tsが拾う ----
export function stepArmies(world: World, names: NameRegistry): void {
  for (const army of [...world.armies]) {
    const faction = world.factions.get(army.factionId);
    if (faction === undefined || faction.fallenTick !== undefined) {
      disbandArmy(world, army);
      continue;
    }
    if (army.battleId !== undefined || army.state === "fight") {
      continue; // 戦場に居る
    }
    const targetPlace = world.places.get(army.target);
    if (targetPlace === undefined) {
      disbandArmy(world, army);
      continue;
    }
    const targetPos = placePos(world, army.target);
    if (army.path.length === 0 && chebyshev(army, targetPos) > 1) {
      const path = armyPathTo(world, army.factionId, { x: army.x, y: army.y }, targetPos);
      if (path === undefined) {
        disbandArmy(world, army);
        continue;
      }
      army.path = path;
    }
    moveArmyAlongPath(world, army, ARMY_SPEED);
    // 将たちの現在地も軍と共に動く
    for (const unit of army.units) {
      const officer = world.officers.get(unit.officerId);
      if (officer !== undefined && officer.status !== "dead") {
        officer.pos = { x: unit.x, y: unit.y };
      }
    }
    if (chebyshev(army, targetPos) > 1) {
      continue;
    }
    // 到着。抵抗が無ければ入城する（抵抗があればfield.tsが攻城戦を開いている）
    const defenderFaction = targetPlace.owner !== undefined ? world.factions.get(targetPlace.owner) : undefined;
    const resists = (defenderFaction !== undefined && defenderFaction.id !== faction.id) || targetPlace.garrison > 150;
    if (resists) {
      continue;
    }
    if (defenderFaction?.id === faction.id) {
      disbandArmy(world, army);
      continue;
    }
    const occupied = occupyPlace(world, faction, targetPlace, army.causeEvent, names);
    if (occupied) {
      emit(world, {
        kind: "war.city-fall",
        loc: targetPlace.id,
        at: targetPos,
        factions: [faction.id],
        actors: armyOfficerIds(army),
        causes: [army.causeEvent],
      });
      targetPlace.garrison += Math.floor(army.units.reduce((s, u) => s + (u.gone ? 0 : u.troops), 0) * 0.8);
    }
    disbandArmy(world, army, occupied);
    if (occupied) {
      for (const unit of army.units) {
        const officer = world.officers.get(unit.officerId);
        if (officer !== undefined && officer.status !== "dead" && officer.status !== "prisoner") {
          officer.loc = targetPlace.id;
          officer.pos = { ...targetPos };
          delete officer.journey;
        }
      }
    }
  }
}

// ---- 流刑の護送と奪還（日次） ----
export function stepConvoys(world: World, names: NameRegistry): void {
  void names;
  for (const convoy of [...world.convoys]) {
    const prisoner = world.officers.get(convoy.prisoner);
    if (prisoner === undefined || prisoner.status !== "prisoner") {
      world.convoys = world.convoys.filter((c) => c !== convoy);
      continue;
    }
    // 枷をはめられた足取りは重い
    convoy.mp += CONVOY_SPEED;
    while (convoy.path.length > 0) {
      const next = convoy.path[0] as XY;
      const diag = next.x !== convoy.x && next.y !== convoy.y ? 1.41 : 1;
      const cost = moveCostOf(world.grid.at(next.x, next.y)) * diag;
      if (!Number.isFinite(cost) || convoy.mp < cost) {
        break;
      }
      convoy.mp -= cost;
      convoy.path.shift();
      convoy.x = next.x;
      convoy.y = next.y;
      prisoner.pos = { x: next.x, y: next.y };
    }

    // 報せを聞いた友は護送路の先へ急ぐ
    const inArmies = new Set(world.armies.flatMap((a) => armyOfficerIds(a)));
    for (const friend of livingOfficers(world)) {
      if (
        friend.id === prisoner.id ||
        friend.status === "prisoner" ||
        friend.factionId === convoy.escortFactionId ||
        friend.journey !== undefined ||
        inArmies.has(friend.id)
      ) {
        continue;
      }
      const rel = friend.rel.get(prisoner.id);
      const close = rel !== undefined && (rel.affinity >= 50 || rel.bond !== undefined);
      if (!close || friend.aptitudes.valor < 60) {
        continue;
      }
      if (chebyshev(friend.pos, convoy) <= 1) {
        continue; // すでに間合いに居る
      }
      // 行く手に先回りする（護送の数歩先を狙う）
      const ahead = convoy.path[Math.min(6, convoy.path.length - 1)] ?? convoy;
      const dist = chebyshev(friend.pos, ahead);
      if (dist > 30) {
        continue; // 遠すぎる報せは届かない
      }
      const path = findTilePath(world.grid, friend.pos, { x: ahead.x, y: ahead.y });
      if (path !== undefined && path.length > 0) {
        friend.journey = { path, dest: convoy.dest, mp: 0, speed: 1.1 };
      }
    }

    // 間合いに潜む友が枷を断つ（林深き難所ほど成功しやすい）
    const rescuers = livingOfficers(world).filter((o) => {
      if (o.id === prisoner.id || o.status === "prisoner" || o.status === "dead") {
        return false;
      }
      if (o.factionId === convoy.escortFactionId) {
        return false;
      }
      const rel = o.rel.get(prisoner.id);
      const close = rel !== undefined && (rel.affinity >= 50 || rel.bond !== undefined);
      return close && o.aptitudes.valor >= 65 && chebyshev(o.pos, convoy) <= 1;
    });
    const rescuer = rescuers[0];
    if (rescuer !== undefined) {
      const t = world.grid.at(convoy.x, convoy.y);
      const terrainBonus = t === T.forest ? 0.35 : t === T.gate || t === T.marsh ? 0.2 : 0;
      // 奪還は日々の賭け（1日あたりの機会は小さく、旅の間に何度も訪れる）
      if (world.rng.chance(0.18 + terrainBonus)) {
        const rescueEvent = emit(world, {
          kind: "life.rescue-convoy",
          loc: prisoner.loc,
          at: { x: convoy.x, y: convoy.y },
          actors: [rescuer.id, prisoner.id],
          causes: [convoy.causeEvent],
          data: { rescuer: rescuer.id, prisoner: prisoner.id },
        });
        prisoner.status = "roaming";
        world.convoys = world.convoys.filter((c) => c !== convoy);
        bindFugitives(world, rescuer, prisoner, rescueEvent.id);
        continue;
      }
    }

    if (convoy.path.length === 0) {
      prisoner.loc = convoy.dest;
      emit(world, {
        kind: "life.prison",
        loc: convoy.dest,
        actors: [prisoner.id],
        causes: [convoy.causeEvent],
        data: { prisoner: prisoner.id },
      });
      world.convoys = world.convoys.filter((c) => c !== convoy);
    }
  }
}

// 奪還者と囚人は運命共同体になる（既存の一党へ、なければ二人の党を興す）
export function bindFugitives(world: World, rescuer: Officer, prisoner: Officer, causeId: EventId): void {
  const rescuerFaction = factionOf(world, rescuer);
  if (rescuerFaction !== undefined && (rescuerFaction.kind === "roaming" || rescuerFaction.kind === "outlaw")) {
    prisoner.factionId = rescuerFaction.id;
    prisoner.status = rescuerFaction.cities.length > 0 ? "serving" : "roaming";
    rescuerFaction.members.push(prisoner.id);
    prisoner.loc = rescuer.loc;
    prisoner.pos = { ...rescuer.pos };
    emit(world, {
      kind: "life.join",
      loc: prisoner.loc,
      actors: [prisoner.id, rescuerFaction.leader],
      factions: [rescuerFaction.id],
      causes: [causeId],
      data: { joiner: prisoner.id, leader: rescuerFaction.leader },
    });
    return;
  }
  rescuer.status = "roaming";
  prisoner.status = "roaming";
  prisoner.loc = rescuer.loc;
  prisoner.pos = { ...rescuer.pos };
}

// ---- 獄と処刑: 牢に繋がれた者の運命（月次） ----
export function stepPrisons(world: World): void {
  for (const officer of livingOfficers(world)) {
    if (officer.status !== "prisoner") {
      continue;
    }
    const inConvoy = world.convoys.some((c) => c.prisoner === officer.id);
    if (inConvoy) {
      continue;
    }
    const holder = [...world.factions.values()].find((f) => f.cities.includes(officer.loc));
    if (holder === undefined) {
      officer.status = "roaming";
      continue;
    }
    // 劫牢: 同じ地に肝胆相照らす友がいれば、夜陰に乗じて牢を破る
    const breaker = livingOfficers(world).find((o) => {
      if (o.id === officer.id || o.status === "prisoner" || o.loc !== officer.loc || o.journey !== undefined) {
        return false;
      }
      if (o.factionId === holder.id) {
        return false;
      }
      const rel = o.rel.get(officer.id);
      return rel !== undefined && (rel.affinity >= 55 || rel.bond !== undefined) && o.aptitudes.valor >= 65;
    });
    if (breaker !== undefined && world.rng.chance(0.35)) {
      const jailbreak = emit(world, {
        kind: "life.jailbreak",
        loc: officer.loc,
        actors: [breaker.id, officer.id],
        factions: [holder.id],
        data: { rescuer: breaker.id, prisoner: officer.id },
      });
      officer.status = "roaming";
      // 法を破った奪還者は、もはや元の場所には居られない
      const breakerFaction = factionOf(world, breaker);
      if (breakerFaction !== undefined && (breakerFaction.kind === "court" || breakerFaction.kind === "manor")) {
        breakerFaction.members = breakerFaction.members.filter((m) => m !== breaker.id);
        delete breaker.factionId;
        breaker.status = "roaming";
      }
      bindFugitives(world, breaker, officer, jailbreak.id);
      continue;
    }
    if (world.rng.chance(holder.corruption / 100 * 0.12)) {
      const leader = world.officers.get(holder.leader);
      emit(world, {
        kind: "life.execute",
        loc: officer.loc,
        actors: [officer.id, holder.leader],
        factions: [holder.id],
        data: { victim: officer.id, orderer: leader?.id ?? holder.leader },
      });
      killOfficer(world, officer);
    } else if (world.rng.chance(0.06)) {
      officer.status = "roaming";
      emit(world, {
        kind: "life.release",
        loc: officer.loc,
        actors: [holder.leader, officer.id],
        data: { captor: holder.leader, released: officer.id },
      });
    }
  }
}

// ---- 頭領の死: 継承・分裂・四散（月次） ----
export function stepSuccessions(world: World, names: NameRegistry): void {
  for (const faction of [...world.factions.values()]) {
    if (faction.fallenTick !== undefined) {
      continue;
    }
    const leader = world.officers.get(faction.leader);
    if (leader !== undefined && leader.status !== "dead") {
      continue;
    }
    const members = membersOf(world, faction);
    if (members.length === 0) {
      faction.fallenTick = world.tick;
      // 主を失った城は無主に戻る（次の主を待つ）
      for (const cityId of faction.cities) {
        const city = world.places.get(cityId);
        if (city !== undefined && city.owner === faction.id) {
          delete city.owner;
        }
      }
      faction.cities = [];
      emit(world, { kind: "faction.disband", factions: [faction.id] });
      continue;
    }
    const heir = members.sort(
      (a, b) =>
        b.aptitudes.charisma + b.aptitudes.leadership + b.fameOutlaw + b.fameOfficial -
        (a.aptitudes.charisma + a.aptitudes.leadership + a.fameOutlaw + a.fameOfficial),
    )[0] as Officer;
    const oldLeaderId = faction.leader;
    faction.leader = heir.id;
    emit(world, {
      kind: "faction.succession",
      loc: heir.loc,
      actors: [heir.id],
      factions: [faction.id],
      data: { old: oldLeaderId, next: heir.id },
    });
    // 新頭領を認めぬ野心家は一党を割る
    const rival = members.find(
      (m) =>
        m.id !== heir.id &&
        m.values.ambition >= 70 &&
        getRelation(m, heir.id).affinity < 10,
    );
    if (rival !== undefined) {
      const followers = members.filter(
        (m) => m.id !== heir.id && m.id !== rival.id && getRelation(m, rival.id).affinity >= 40,
      );
      const splitEvent = emit(world, {
        kind: "faction.split",
        loc: rival.loc,
        actors: [rival.id, ...followers.map((f) => f.id)],
        factions: [faction.id],
        data: { leader: rival.id },
      });
      const newFaction: Faction = {
        id: nextId(world, "f"),
        kind: "roaming",
        leader: rival.id,
        members: [rival.id, ...followers.map((f) => f.id)],
        cities: [],
        loc: rival.loc,
        gold: Math.floor(faction.gold * 0.2),
        policy: "seeklair",
        corruption: 20,
        legitimacy: 10,
        feud: new Map([[faction.id, 30]]),
        foundedTick: world.tick,
      };
      faction.gold -= newFaction.gold;
      faction.members = faction.members.filter((m) => !newFaction.members.includes(m));
      for (const m of newFaction.members) {
        const officer = world.officers.get(m);
        if (officer !== undefined) {
          officer.factionId = newFaction.id;
          officer.status = "roaming";
        }
      }
      world.factions.set(newFaction.id, newFaction);
      names.registerBand(newFaction.id, rival.id, world.tick);
      void splitEvent;
    }
  }
}

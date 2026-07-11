// 責務: 勢力AI。方針決定→任務（侵攻・討伐・護送・収奪）→戦後処理→勢力の興亡（滅亡は消滅ではなく放浪への転落）
import { runBattle } from "./battle";
import { emit } from "./events";
import type {
  Army,
  EventId,
  Faction,
  FactionId,
  NameRegistry,
  Officer,
  Place,
  World,
} from "./model";
import {
  distanceBetween,
  factionOf,
  factionStrength,
  findPath,
  getRelation,
  grudgeScore,
  livingOfficers,
  neighborsOf,
  nextId,
  powerOf,
} from "./model";

function membersOf(world: World, faction: Faction): Officer[] {
  return faction.members
    .map((id) => world.officers.get(id))
    .filter((o): o is Officer => o !== undefined && o.status !== "dead");
}

function fieldedMembers(world: World, faction: Faction): Officer[] {
  const inArmies = new Set(world.armies.flatMap((a) => a.officers));
  return membersOf(world, faction).filter(
    (o) => o.status === "serving" || o.status === "roaming",
  ).filter((o) => !inArmies.has(o.id));
}

// ---- 世界の揺らぎ: 天災と収奪 ----
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

// 放浪の一党は月ごとに動く（要害を目指し、着けば山寨を開く）
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
      faction.members = faction.members.filter((m) => m !== victim.id);
      victim.fameOfficial = Math.max(0, victim.fameOfficial - 20);
      const dest = world.exileDest;
      const path = findPath(world, victim.loc, dest);
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
        loc: victim.loc,
        path,
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

function roamingStrategy(world: World, faction: Faction, leader: Officer, names: NameRegistry): void {
  const loc = faction.loc ?? leader.loc;
  const here = world.places.get(loc);
  const members = membersOf(world, faction);

  // 要害に着いていて頭数が揃えば山寨を開く
  if (
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
    let bestDist = Number.POSITIVE_INFINITY;
    for (const t of freeLairs) {
      const path = findPath(world, loc, t.id);
      if (path.length > 0 && path.length < bestDist) {
        bestDist = path.length;
        goal = t;
      }
    }
  } else if (members.length >= 3) {
    goal = [...world.places.values()]
      .filter((p) => (p.kind === "lairsite" || p.kind === "marsh") && p.owner !== faction.id)
      .sort((a, b) => a.garrison - b.garrison)[0];
  }

  // よその山寨の門前に立ったなら、力ずくで奪う
  if (goal !== undefined && loc === goal.id && goal.owner !== undefined && goal.owner !== faction.id) {
    bandAssault(world, faction, goal, names);
    return;
  }

  const nextStep = goal !== undefined ? findPath(world, loc, goal.id)[0] : neighborsOf(world, loc)[0];
  if (nextStep !== undefined) {
    faction.loc = nextStep;
    for (const member of members) {
      member.loc = nextStep;
    }
  }
}

// 放浪の一党による山寨の乗っ取り。軍の編成を経ない、体ひとつの殴り込み
function bandAssault(world: World, faction: Faction, place: Place, names: NameRegistry): void {
  const ownerFaction = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
  const members = membersOf(world, faction).filter((o) => o.status !== "prisoner");
  if (members.length === 0) {
    return;
  }
  const declare = emit(world, {
    kind: "war.declare",
    loc: place.id,
    actors: members.map((m) => m.id),
    factions: [faction.id, place.owner ?? ""],
    data: { target: place.id, troops: members.length * 80 },
  });
  const defenders =
    ownerFaction !== undefined
      ? fieldedMembers(world, ownerFaction).filter((o) => o.loc === place.id).slice(0, 6)
      : [];
  if (defenders.length === 0) {
    const attackPower = members.reduce((sum, m) => sum + powerOf(m), 0) * 10 + members.length * 80;
    if (attackPower > place.garrison * (1 + place.defense / 80)) {
      const fall = emit(world, {
        kind: "war.city-fall",
        loc: place.id,
        factions: [faction.id, ownerFaction?.id ?? ""],
        actors: members.map((m) => m.id),
        causes: [declare.id],
      });
      place.garrison = Math.max(members.length * 50, Math.floor(place.garrison * 0.3));
      if (ownerFaction !== undefined) {
        stripPlace(world, ownerFaction, place, names, fall.id, faction.id);
      }
      occupyPlace(world, faction, place, fall.id, names);
    } else {
      emit(world, {
        kind: "war.repelled",
        loc: place.id,
        factions: [faction.id, ownerFaction?.id ?? ""],
        causes: [declare.id],
      });
    }
    return;
  }
  const outcome = runBattle({
    world,
    place,
    attacker: { factionId: faction.id, officers: members.slice(0, 6), troops: members.length * 80 },
    defender: { factionId: ownerFaction?.id ?? "", officers: defenders, troops: Math.max(80, place.garrison) },
    siege: false,
    causeEvent: declare.id,
  });
  handleFallen(world, outcome.dead);
  place.devastation = Math.min(100, place.devastation + outcome.burntCells + outcome.rubbleCells);
  place.garrison = Math.max(0, place.garrison - outcome.defenderLoss);
  if (outcome.attackerWon && ownerFaction !== undefined) {
    emit(world, {
      kind: "war.city-fall",
      loc: place.id,
      factions: [faction.id, ownerFaction.id],
      actors: members.map((m) => m.id),
      causes: [outcome.battleEvent],
    });
    handleCaptives(world, outcome.captured, faction, ownerFaction, outcome.battleEvent);
    stripPlace(world, ownerFaction, place, names, outcome.battleEvent, faction.id);
    occupyPlace(world, faction, place, outcome.battleEvent, names);
    place.garrison = Math.max(place.garrison, members.length * 50);
  } else if (!outcome.attackerWon && ownerFaction !== undefined) {
    emit(world, {
      kind: "war.repelled",
      loc: place.id,
      factions: [faction.id, ownerFaction.id],
      causes: [outcome.battleEvent],
    });
    handleCaptives(world, outcome.captured, ownerFaction, faction, outcome.battleEvent);
  }
}

// ---- 軍の編成と進発 ----
function launchArmy(world: World, faction: Faction, target: string, goal: Army["goal"]): void {
  if (target === "") {
    return;
  }
  const candidates = fieldedMembers(world, faction)
    .filter((o) => o.id !== faction.leader || faction.kind === "outlaw" || faction.kind === "roaming")
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
  source.garrison -= troops;
  const path = findPath(world, source.id, target);
  const declare = emit(world, {
    kind: "war.declare",
    loc: source.id,
    actors: officers.map((o) => o.id),
    factions: [faction.id, world.places.get(target)?.owner ?? ""],
    data: { target, troops, warId: nextId(world, "w") },
  });
  for (const o of officers) {
    o.loc = source.id;
  }
  world.armies.push({
    id: nextId(world, "a"),
    factionId: faction.id,
    officers: officers.map((o) => o.id),
    troops,
    loc: source.id,
    path,
    target,
    goal,
    causeEvent: declare.id,
  });
}

// ---- 軍の行軍と会戦 ----
export function stepArmies(world: World, names: NameRegistry): void {
  for (const army of [...world.armies]) {
    const faction = world.factions.get(army.factionId);
    if (faction === undefined || faction.fallenTick !== undefined) {
      disbandArmy(world, army);
      continue;
    }
    const next = army.path.shift();
    if (next !== undefined) {
      army.loc = next;
      for (const oid of army.officers) {
        const officer = world.officers.get(oid);
        if (officer !== undefined && officer.status !== "dead") {
          officer.loc = next;
        }
      }
    }
    if (army.loc !== army.target) {
      continue;
    }
    resolveAssault(world, army, faction, names);
  }
}

function resolveAssault(world: World, army: Army, faction: Faction, names: NameRegistry): void {
  const place = world.places.get(army.target);
  if (place === undefined) {
    disbandArmy(world, army);
    return;
  }
  const defenderFaction = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
  if (defenderFaction === undefined || defenderFaction.id === faction.id) {
    // 無主の城でも残兵は抗う
    if (defenderFaction === undefined && place.garrison > 150) {
      if (army.troops <= place.garrison * (1 + place.defense / 80)) {
        emit(world, {
          kind: "war.repelled",
          loc: place.id,
          factions: [faction.id],
          causes: [army.causeEvent],
        });
        army.troops = Math.floor(army.troops * 0.7);
        place.garrison = Math.floor(place.garrison * 0.85);
        disbandArmy(world, army);
        return;
      }
      army.troops = Math.floor(army.troops * 0.85);
      place.garrison = Math.floor(place.garrison * 0.25);
    }
    const occupied = occupyPlace(world, faction, place, army.causeEvent, names);
    if (occupied) {
      emit(world, {
        kind: "war.city-fall",
        loc: place.id,
        factions: [faction.id],
        actors: army.officers,
        causes: [army.causeEvent],
      });
      place.garrison += Math.floor(army.troops * 0.8);
    }
    disbandArmy(world, army, occupied);
    return;
  }

  const attackers = army.officers
    .map((id) => world.officers.get(id))
    .filter((o): o is Officer => o !== undefined && o.status !== "dead");
  // 守将はその地にいる者、次いで隣接する自領から駆けつける（遠隔地からの瞬間移動はしない）
  const defenders = fieldedMembers(world, defenderFaction)
    .filter((o) => o.loc === place.id)
    .slice(0, 6);
  if (defenders.length < 3) {
    // 広い世界では二辺以内の自領から守将が駆けつける
    const nearby = fieldedMembers(world, defenderFaction).filter(
      (o) =>
        o.loc !== place.id &&
        defenderFaction.cities.includes(o.loc) &&
        distanceBetween(world, o.loc, place.id) <= 2,
    );
    defenders.push(...nearby.slice(0, 3 - defenders.length));
  }
  for (const d of defenders) {
    d.loc = place.id;
  }

  // 守将不在なら采配なき籠城。兵力と城壁だけの勝負になる
  if (defenders.length === 0) {
    const holdPower = place.garrison * (1 + place.defense / 80);
    if (army.troops > holdPower) {
      const fall = emit(world, {
        kind: "war.city-fall",
        loc: place.id,
        factions: [faction.id, defenderFaction.id],
        actors: army.officers,
        causes: [army.causeEvent],
      });
      place.garrison = Math.floor(place.garrison * 0.25);
      army.troops = Math.floor(army.troops * 0.85);
      stripPlace(world, defenderFaction, place, names, fall.id, faction.id);
      const occupied = occupyPlace(world, faction, place, fall.id, names);
      if (occupied) {
        place.garrison += Math.floor(army.troops * 0.8);
      }
      disbandArmy(world, army, occupied);
    } else {
      emit(world, {
        kind: "war.repelled",
        loc: place.id,
        factions: [faction.id, defenderFaction.id],
        causes: [army.causeEvent],
      });
      army.troops = Math.floor(army.troops * 0.7);
      place.garrison = Math.floor(place.garrison * 0.85);
      disbandArmy(world, army);
    }
    return;
  }

  const siege = place.defense >= 35 && (place.kind === "capital" || place.kind === "county" || place.kind === "manor");
  const outcome = runBattle({
    world,
    place,
    attacker: { factionId: faction.id, officers: attackers, troops: army.troops },
    defender: {
      factionId: defenderFaction.id,
      officers: defenders,
      troops: Math.max(80, place.garrison),
    },
    siege,
    causeEvent: army.causeEvent,
  });

  // 世界への恒久的な傷跡: 焼け跡と瓦礫は都市の力を削る
  place.devastation = Math.min(100, place.devastation + outcome.burntCells + outcome.rubbleCells);
  place.wealth = Math.max(3, place.wealth - Math.floor(outcome.burntCells * 0.6));
  place.defense = Math.max(5, place.defense - Math.floor(outcome.burntCells * 0.4) - (outcome.gateBreached ? 6 : 0));

  handleFallen(world, outcome.dead);
  army.troops = Math.max(0, army.troops - outcome.attackerLoss);
  place.garrison = Math.max(0, place.garrison - outcome.defenderLoss);

  if (outcome.attackerWon) {
    emit(world, {
      kind: "war.city-fall",
      loc: place.id,
      factions: [faction.id, defenderFaction.id],
      actors: army.officers,
      causes: [outcome.battleEvent],
    });
    for (const winner of attackers) {
      if (winner.status !== "dead") {
        winner.fameOfficial += faction.kind === "court" ? 4 : 0;
        winner.fameOutlaw += faction.kind === "court" ? 0 : 4;
      }
    }
    handleCaptives(world, outcome.captured, faction, defenderFaction, outcome.battleEvent);
    stripPlace(world, defenderFaction, place, names, outcome.battleEvent, faction.id);
    const occupied = occupyPlace(world, faction, place, outcome.battleEvent, names);
    const leader = world.officers.get(faction.leader);
    if (occupied && leader !== undefined && (leader.values.acquisition >= 65 || leader.values.aggression >= 75)) {
      place.wealth = Math.max(3, place.wealth - 15);
      place.sentiment = Math.max(0, place.sentiment - 15);
      emit(world, {
        kind: "war.plunder",
        loc: place.id,
        factions: [faction.id],
        actors: [leader.id],
        causes: [outcome.battleEvent],
        data: { leader: leader.id },
      });
    }
    if (occupied) {
      place.garrison += Math.floor(army.troops * 0.8);
    }
    disbandArmy(world, army, occupied);
  } else {
    emit(world, {
      kind: "war.repelled",
      loc: place.id,
      factions: [faction.id, defenderFaction.id],
      causes: [outcome.battleEvent],
    });
    // 敗戦は懲りる。しばらくは同じ砦に兵を向けない
    faction.feud.set(defenderFaction.id, Math.max(0, (faction.feud.get(defenderFaction.id) ?? 0) - 35));
    handleCaptives(world, outcome.captured, defenderFaction, faction, outcome.battleEvent);
    disbandArmy(world, army);
  }
}

function occupyPlace(
  world: World,
  faction: Faction,
  place: Place,
  causeId: EventId,
  names: NameRegistry,
): boolean {
  // 官軍は山寨を統治しない。焼き払って引き揚げる（要害はいずれ次の緑林が拠る——この循環が世界の心臓）
  if (faction.kind === "court" && (place.kind === "lairsite" || place.kind === "marsh")) {
    delete place.owner;
    place.garrison = 0;
    place.defense = Math.max(5, place.defense - 8);
    place.devastation = Math.min(100, place.devastation + 10);
    emit(world, {
      kind: "war.raze",
      loc: place.id,
      factions: [faction.id],
      causes: [causeId],
      data: {},
    });
    return false;
  }
  place.owner = faction.id;
  if (!faction.cities.includes(place.id)) {
    faction.cities.push(place.id);
  }
  delete faction.loc;
  // 緑林が城市を得れば、もはや山賊ではない
  if (faction.kind === "outlaw" && (place.kind === "county" || place.kind === "capital" || place.kind === "manor")) {
    faction.kind = "warlord";
    faction.legitimacy = Math.min(60, faction.legitimacy + 20);
    emit(world, {
      kind: "faction.rise",
      loc: place.id,
      factions: [faction.id],
      actors: [faction.leader],
      causes: [causeId],
    });
  }
  if (faction.kind === "roaming") {
    faction.kind = place.kind === "lairsite" || place.kind === "marsh" ? "outlaw" : "warlord";
    names.registerLair(faction.id, place.id, world.tick);
  }
  return true;
}

function stripPlace(
  world: World,
  loser: Faction,
  place: Place,
  names: NameRegistry,
  causeId: EventId,
  attackerFactionId?: FactionId,
): void {
  loser.cities = loser.cities.filter((c) => c !== place.id);
  if (attackerFactionId !== undefined) {
    // 城を奪われた恨みは深い。奪回の火種になる
    loser.feud.set(attackerFactionId, (loser.feud.get(attackerFactionId) ?? 0) + 60);
  }
  if (loser.cities.length > 0) {
    return;
  }
  // 領地を全て失った勢力は消滅しない。散り散りの放浪軍となって世を漂う
  loser.kind = "roaming";
  delete loser.fallenTick;
  const survivors = membersOf(world, loser).filter((o) => o.status === "serving" || o.status === "roaming");
  const fallEvent = emit(world, {
    kind: "faction.fall",
    loc: place.id,
    factions: [loser.id],
    actors: survivors.map((o) => o.id),
    causes: [causeId],
  });
  const escape = neighborsOf(world, place.id).find((pid) => {
    const p = world.places.get(pid);
    return p !== undefined && p.owner !== place.owner;
  }) ?? neighborsOf(world, place.id)[0];
  const dest = escape ?? place.id;
  loser.loc = dest;
  for (const survivor of survivors) {
    survivor.status = "roaming";
    survivor.loc = dest;
  }
  if (survivors.length === 0) {
    loser.fallenTick = world.tick;
    emit(world, {
      kind: "faction.disband",
      factions: [loser.id],
      causes: [fallEvent.id],
    });
  }
}

function handleFallen(world: World, deadIds: string[]): void {
  for (const id of deadIds) {
    const officer = world.officers.get(id);
    if (officer === undefined || officer.status === "dead") {
      continue;
    }
    killOfficer(world, officer);
  }
}

export function killOfficer(world: World, officer: Officer): void {
  officer.status = "dead";
  officer.deathTick = world.tick;
  officer.hp = 0;
  const faction = factionOf(world, officer);
  if (faction !== undefined) {
    faction.members = faction.members.filter((m) => m !== officer.id);
  }
  delete officer.factionId;
}

function handleCaptives(
  world: World,
  captured: string[],
  captorFaction: Faction,
  loserFaction: Faction,
  causeId: EventId,
): void {
  const captorLeader = world.officers.get(captorFaction.leader);
  for (const id of captured) {
    const captive = world.officers.get(id);
    if (captive === undefined || captive.status === "dead" || captorLeader === undefined) {
      continue;
    }
    loserFaction.members = loserFaction.members.filter((m) => m !== captive.id);
    delete captive.factionId;

    const affinity = getRelation(captive, captorLeader.id).affinity;
    const wantsRecruit =
      captorLeader.values.altruism >= 60 &&
      captorLeader.aptitudes.charisma >= 60 &&
      grudgeScore(captive, captorLeader.id) < 40;
    if (wantsRecruit) {
      const yielding =
        (100 - captive.values.loyalty) * 0.4 +
        captorLeader.aptitudes.charisma * 0.4 +
        affinity * 0.3 +
        world.rng.range(0, 30);
      if (yielding > 60) {
        captive.status = captorFaction.cities.length > 0 ? "serving" : "roaming";
        captive.factionId = captorFaction.id;
        captorFaction.members.push(captive.id);
        captive.loc = captorFaction.cities[0] ?? captorFaction.loc ?? captive.loc;
        emit(world, {
          kind: "life.recruit",
          loc: captive.loc,
          actors: [captorLeader.id, captive.id],
          factions: [captorFaction.id],
          causes: [causeId],
          data: { leader: captorLeader.id, joiner: captive.id },
        });
        continue;
      }
      captive.status = "roaming";
      emit(world, {
        kind: "life.release",
        loc: captive.loc,
        actors: [captorLeader.id, captive.id],
        causes: [causeId],
        data: { captor: captorLeader.id, released: captive.id },
      });
      continue;
    }
    // 情け容赦なき勝者は見せしめに斬る（怨恨が世界に撒かれる）
    if (captorLeader.values.altruism <= 40 || (captorFaction.feud.get(loserFaction.id) ?? 0) >= 50) {
      const execEvent = emit(world, {
        kind: "life.execute",
        loc: captorFaction.cities[0] ?? captive.loc,
        actors: [captive.id, captorLeader.id],
        factions: [captorFaction.id],
        causes: [causeId],
        data: { victim: captive.id, orderer: captorLeader.id },
      });
      void execEvent;
      killOfficer(world, captive);
      continue;
    }
    captive.status = "roaming";
    emit(world, {
      kind: "life.release",
      loc: captive.loc,
      actors: [captorLeader.id, captive.id],
      causes: [causeId],
      data: { captor: captorLeader.id, released: captive.id },
    });
  }
}

function disbandArmy(world: World, army: Army, absorbed = false): void {
  world.armies = world.armies.filter((a) => a !== army);
  if (absorbed) {
    return;
  }
  const faction = world.factions.get(army.factionId);
  const home = faction?.cities[0];
  if (home !== undefined) {
    const place = world.places.get(home);
    if (place !== undefined) {
      place.garrison += Math.floor(army.troops * 0.9);
    }
    for (const oid of army.officers) {
      const officer = world.officers.get(oid);
      if (officer !== undefined && officer.status !== "dead" && officer.status !== "prisoner") {
        officer.loc = home;
      }
    }
  }
}

// ---- 流刑の護送と奪還 ----
export function stepConvoys(world: World, names: NameRegistry): void {
  void names;
  for (const convoy of [...world.convoys]) {
    const prisoner = world.officers.get(convoy.prisoner);
    if (prisoner === undefined || prisoner.status !== "prisoner") {
      world.convoys = world.convoys.filter((c) => c !== convoy);
      continue;
    }
    // 枷をはめられた足取りは重い（隔月でしか進まない。友が駆けつける猶予がある）
    if (world.tick % 2 === 0) {
      const next = convoy.path.shift();
      if (next !== undefined) {
        convoy.loc = next;
        prisoner.loc = next;
      }
    }
    const here = world.places.get(convoy.loc);

    // 報せを聞いた友は護送路へ急ぐ
    const inArmies = new Set(world.armies.flatMap((a) => a.officers));
    for (const friend of livingOfficers(world)) {
      if (
        friend.id === prisoner.id ||
        friend.status === "prisoner" ||
        friend.factionId === convoy.escortFactionId ||
        friend.loc === convoy.loc ||
        inArmies.has(friend.id)
      ) {
        continue;
      }
      const rel = friend.rel.get(prisoner.id);
      const close = rel !== undefined && (rel.affinity >= 50 || rel.bond !== undefined);
      if (!close || friend.aptitudes.valor < 60) {
        continue;
      }
      const path = findPath(world, friend.loc, convoy.loc);
      const step = path[0];
      if (path.length > 0 && path.length <= 3 && step !== undefined) {
        friend.loc = step;
      }
    }

    // 街道に潜む友が枷を断つ（林深き難所ほど成功しやすい）
    const rescuers = livingOfficers(world).filter((o) => {
      if (o.id === prisoner.id || o.status === "prisoner" || o.status === "dead") {
        return false;
      }
      if (o.factionId === convoy.escortFactionId) {
        return false;
      }
      const rel = o.rel.get(prisoner.id);
      const close = rel !== undefined && (rel.affinity >= 50 || rel.bond !== undefined);
      return close && o.aptitudes.valor >= 65 && o.loc === convoy.loc;
    });
    const rescuer = rescuers[0];
    if (rescuer !== undefined) {
      const forestBonus = (here?.terrainForest ?? 0) * 0.5;
      if (world.rng.chance(0.55 + forestBonus)) {
        const rescueEvent = emit(world, {
          kind: "life.rescue-convoy",
          loc: convoy.loc,
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
      emit(world, {
        kind: "life.prison",
        loc: convoy.loc,
        actors: [prisoner.id],
        causes: [convoy.causeEvent],
        data: { prisoner: prisoner.id },
      });
      world.convoys = world.convoys.filter((c) => c !== convoy);
    }
  }
}

// 奪還者と囚人は運命共同体になる（既存の一党へ、なければ二人の党を興す）
function bindFugitives(world: World, rescuer: Officer, prisoner: Officer, causeId: EventId): void {
  const rescuerFaction = factionOf(world, rescuer);
  if (rescuerFaction !== undefined && (rescuerFaction.kind === "roaming" || rescuerFaction.kind === "outlaw")) {
    prisoner.factionId = rescuerFaction.id;
    prisoner.status = rescuerFaction.cities.length > 0 ? "serving" : "roaming";
    rescuerFaction.members.push(prisoner.id);
    prisoner.loc = rescuer.loc;
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
}

// ---- 獄と処刑: 牢に繋がれた者の運命 ----
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
      if (o.id === officer.id || o.status === "prisoner" || o.loc !== officer.loc) {
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

// ---- 頭領の死: 継承・分裂・四散 ----
export function stepSuccessions(world: World, names: NameRegistry): void {
  void names;
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

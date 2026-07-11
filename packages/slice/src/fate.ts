// 責務: 戦いの政治的帰結。死・捕虜の処遇・占領・落城・軍の解散——戦闘エンジンと勢力AIが共有する運命の裁き
import { emit } from "./events";
import type { Army, EventId, Faction, FactionId, NameRegistry, Officer, Place, World } from "./model";
import { armyTroops, factionOf, getRelation, grudgeScore, neighborsOf, placePos } from "./model";

export function killOfficer(world: World, officer: Officer): void {
  officer.status = "dead";
  officer.deathTick = world.tick;
  officer.hp = 0;
  delete officer.journey;
  const faction = factionOf(world, officer);
  if (faction !== undefined) {
    faction.members = faction.members.filter((m) => m !== officer.id);
  }
  delete officer.factionId;
}

export function handleFallen(world: World, deadIds: string[]): void {
  for (const id of deadIds) {
    const officer = world.officers.get(id);
    if (officer === undefined || officer.status === "dead") {
      continue;
    }
    killOfficer(world, officer);
  }
}

// 捕虜の処遇: 器量ある勝者は登用を試み、酷薄な勝者は見せしめに斬る
export function handleCaptive(
  world: World,
  captiveId: string,
  captorFaction: Faction,
  causeId: EventId,
): void {
  const captive = world.officers.get(captiveId);
  const captorLeader = world.officers.get(captorFaction.leader);
  if (captive === undefined || captive.status === "dead" || captorLeader === undefined) {
    return;
  }
  const loserFaction = captive.factionId !== undefined ? world.factions.get(captive.factionId) : undefined;
  if (loserFaction !== undefined) {
    loserFaction.members = loserFaction.members.filter((m) => m !== captive.id);
  }
  delete captive.factionId;
  captive.status = "prisoner";

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
      const dest = captorFaction.cities[0] ?? captorFaction.loc;
      if (dest !== undefined) {
        captive.loc = dest;
        captive.pos = placePos(world, dest);
      }
      emit(world, {
        kind: "life.recruit",
        loc: captive.loc,
        actors: [captorLeader.id, captive.id],
        factions: [captorFaction.id],
        causes: [causeId],
        data: { leader: captorLeader.id, joiner: captive.id, surrendered: true },
      });
      return;
    }
    captive.status = "roaming";
    emit(world, {
      kind: "life.release",
      loc: captive.loc,
      actors: [captorLeader.id, captive.id],
      causes: [causeId],
      data: { captor: captorLeader.id, released: captive.id },
    });
    return;
  }
  const feudHeat = loserFaction !== undefined ? (captorFaction.feud.get(loserFaction.id) ?? 0) : 0;
  if (captorLeader.values.altruism <= 40 || feudHeat >= 50) {
    emit(world, {
      kind: "life.execute",
      loc: captorFaction.cities[0] ?? captive.loc,
      actors: [captive.id, captorLeader.id],
      factions: [captorFaction.id],
      causes: [causeId],
      data: { victim: captive.id, orderer: captorLeader.id },
    });
    killOfficer(world, captive);
    return;
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

export function occupyPlace(
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
    world.grid.scar(place.gridX, place.gridY, "burnt", world.tick);
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

export function stripPlace(
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
  const survivors = [...world.officers.values()].filter(
    (o) => o.factionId === loser.id && (o.status === "serving" || o.status === "roaming"),
  );
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
    survivor.pos = placePos(world, dest);
    delete survivor.journey;
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

// 城が落ちる。掠奪と占領、敗者の転落までを一括で裁く
export function resolveCityFall(
  world: World,
  attacker: Faction,
  army: Army | undefined,
  place: Place,
  causeId: EventId,
  names: NameRegistry,
): void {
  const defenderFaction = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
  const actors = army !== undefined ? army.units.filter((u) => !u.gone).map((u) => u.officerId) : [];
  const fall = emit(world, {
    kind: "war.city-fall",
    loc: place.id,
    factions: defenderFaction !== undefined ? [attacker.id, defenderFaction.id] : [attacker.id],
    actors,
    causes: [causeId],
  });
  place.garrison = Math.floor(place.garrison * 0.25);
  if (defenderFaction !== undefined && defenderFaction.id !== attacker.id) {
    stripPlace(world, defenderFaction, place, names, fall.id, attacker.id);
  }
  const occupied = occupyPlace(world, attacker, place, fall.id, names);
  const leader = world.officers.get(attacker.leader);
  if (occupied && leader !== undefined && (leader.values.acquisition >= 65 || leader.values.aggression >= 75)) {
    place.wealth = Math.max(3, place.wealth - 15);
    place.sentiment = Math.max(0, place.sentiment - 15);
    emit(world, {
      kind: "war.plunder",
      loc: place.id,
      factions: [attacker.id],
      actors: [leader.id],
      causes: [fall.id],
      data: { leader: leader.id },
    });
  }
  if (army !== undefined) {
    for (const unit of army.units) {
      if (unit.gone) {
        continue;
      }
      const winner = world.officers.get(unit.officerId);
      if (winner !== undefined && winner.status !== "dead") {
        winner.fameOfficial += attacker.kind === "court" ? 4 : 0;
        winner.fameOutlaw += attacker.kind === "court" ? 0 : 4;
      }
    }
    if (occupied) {
      place.garrison += Math.floor(armyTroops(army) * 0.8);
      disbandArmy(world, army, true);
      // 占領軍の武将は城に入る
      for (const unit of army.units) {
        const officer = world.officers.get(unit.officerId);
        if (officer !== undefined && officer.status !== "dead" && officer.status !== "prisoner") {
          officer.loc = place.id;
          officer.pos = { x: place.gridX, y: place.gridY };
          delete officer.journey;
        }
      }
    } else {
      disbandArmy(world, army);
    }
  }
}

export function disbandArmy(world: World, army: Army, absorbed = false): void {
  world.armies = world.armies.filter((a) => a !== army);
  if (absorbed) {
    return;
  }
  const faction = world.factions.get(army.factionId);
  const home = faction?.cities[0];
  if (home !== undefined) {
    const place = world.places.get(home);
    if (place !== undefined) {
      place.garrison += Math.floor(armyTroops(army) * 0.9);
    }
    for (const unit of army.units) {
      const officer = world.officers.get(unit.officerId);
      if (officer !== undefined && officer.status !== "dead" && officer.status !== "prisoner") {
        officer.loc = home;
        officer.pos = placePos(world, home);
        delete officer.journey;
      }
    }
  }
}

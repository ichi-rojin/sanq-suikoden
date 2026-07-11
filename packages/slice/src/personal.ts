// 責務: 武将個人AI。武将は勢力の駒ではなく、勢力AIとは別に交流し、怨み、義を結び、人生を送る
// 裁定R-17: 武将は拠点間を瞬間移動しない。世界タイルを一歩ずつ歩き、道中で出会い、襲われ、擦れ違う
import { emit } from "./events";
import { killOfficer } from "./fate";
import type { XY } from "./grid";
import { chebyshev, findTilePath, moveCostOf } from "./grid";
import type { NameRegistry, Officer, World } from "./model";
import {
  armyOfficerIds,
  factionOf,
  getRelation,
  grudgeScore,
  livingOfficers,
  monthOf,
  nextId,
  officersAt,
  placePos,
} from "./model";

function busyOfficerIds(world: World): Set<string> {
  const ids = new Set<string>();
  for (const army of world.armies) {
    for (const oid of armyOfficerIds(army)) {
      ids.add(oid);
    }
  }
  for (const convoy of world.convoys) {
    ids.add(convoy.prisoner);
  }
  return ids;
}

// 旅立ち: 目的地への道をタイルで引く
export function startJourney(world: World, officer: Officer, dest: string, speed = 1.0): boolean {
  const to = placePos(world, dest);
  const path = findTilePath(world.grid, officer.pos, to);
  if (path === undefined || path.length === 0) {
    return false;
  }
  officer.journey = { path, dest, mp: 0, speed };
  return true;
}

// ---- 日次: 旅人たちの歩みと道中の運命 ----
export function stepJourneys(world: World): void {
  const busy = busyOfficerIds(world);
  const travelers: Officer[] = [];
  for (const officer of livingOfficers(world)) {
    if (officer.journey === undefined || busy.has(officer.id) || officer.status === "prisoner") {
      continue;
    }
    const journey = officer.journey;
    journey.mp += journey.speed;
    while (journey.path.length > 0) {
      const next = journey.path[0] as XY;
      const diag = next.x !== officer.pos.x && next.y !== officer.pos.y ? 1.41 : 1;
      const cost = moveCostOf(world.grid.at(next.x, next.y)) * diag;
      if (!Number.isFinite(cost)) {
        delete officer.journey; // 道が塞がれた（崖崩れ・延焼）。旅を諦める
        break;
      }
      if (journey.mp < cost) {
        break;
      }
      journey.mp -= cost;
      journey.path.shift();
      officer.pos = { x: next.x, y: next.y };
    }
    if (officer.journey !== undefined && officer.journey.path.length === 0) {
      officer.loc = officer.journey.dest;
      delete officer.journey;
    } else if (officer.journey !== undefined) {
      travelers.push(officer);
    }
  }

  // 放浪の一党は頭領と共に歩む
  for (const faction of world.factions.values()) {
    if (faction.kind !== "roaming" || faction.fallenTick !== undefined) {
      continue;
    }
    const leader = world.officers.get(faction.leader);
    if (leader === undefined || leader.status === "dead") {
      continue;
    }
    for (const memberId of faction.members) {
      const member = world.officers.get(memberId);
      if (member === undefined || member.id === leader.id || member.status !== "roaming" || busy.has(member.id)) {
        continue;
      }
      member.pos = { ...leader.pos };
      member.loc = leader.loc;
      delete member.journey;
    }
    if (leader.journey === undefined) {
      faction.loc = leader.loc;
    }
  }

  // 道中の運命: 追い剥ぎと擦れ違い（都市の外でも世界は動く）
  const rng = world.rng;
  for (const traveler of travelers) {
    // 追い剥ぎ: 手癖の悪い者が街道の難所に立つ
    const robbers = livingOfficers(world).filter(
      (o) =>
        o.id !== traveler.id &&
        o.journey === undefined &&
        !busy.has(o.id) &&
        o.status !== "prisoner" &&
        (o.factionId === undefined || o.factionId !== traveler.factionId) &&
        o.values.aggression >= 60 &&
        o.values.acquisition >= 45 &&
        chebyshev(o.pos, traveler.pos) <= 1,
    );
    const robber = robbers[0];
    if (robber !== undefined && rng.chance(0.2)) {
      const toll = Math.min(traveler.gold, 10);
      traveler.gold -= toll;
      robber.gold += toll;
      traveler.hp = Math.max(1, traveler.hp - 8);
      robber.fameOutlaw = Math.min(100, robber.fameOutlaw + 3);
      emit(world, {
        kind: "life.raid-travelers",
        at: { x: traveler.pos.x, y: traveler.pos.y },
        actors: [robber.id, traveler.id],
        data: { actor: robber.id, victim: traveler.id },
      });
      continue;
    }
    // 擦れ違い: 旅人同士が道で出会う
    const other = travelers.find(
      (o) => o.id !== traveler.id && chebyshev(o.pos, traveler.pos) <= 1 && !traveler.rel.has(o.id),
    );
    if (other !== undefined && rng.chance(0.3)) {
      const diff =
        Math.abs(traveler.values.altruism - other.values.altruism) +
        Math.abs(traveler.values.aggression - other.values.aggression) +
        Math.abs(traveler.values.acquisition - other.values.acquisition);
      let impression = Math.floor((90 - diff) / 3);
      if (traveler.aptitudes.valor >= 80 && other.aptitudes.valor >= 80) {
        impression += 12; // 豪傑は豪傑を知る
      }
      getRelation(traveler, other.id).affinity = impression;
      getRelation(other, traveler.id).affinity = impression;
      if (Math.abs(impression) >= 8) {
        emit(world, {
          kind: "life.meet",
          at: { x: traveler.pos.x, y: traveler.pos.y },
          actors: [traveler.id, other.id],
          data: { onRoad: true },
        });
      }
    }
  }
}

// ---- 月次: 人生の節目 ----
export function stepPersonalLives(world: World, names: NameRegistry): void {
  const busy = busyOfficerIds(world);

  for (const officer of world.rng.shuffle(livingOfficers(world))) {
    if (officer.status === "dead" || officer.status === "prisoner" || busy.has(officer.id)) {
      continue;
    }
    officer.hp = Math.min(100, officer.hp + 6);
    if (officer.journey !== undefined) {
      continue; // 旅の空の下では節目の決断はしない
    }

    if (officer.status === "serving") {
      if (tryDefect(world, officer, names)) {
        continue;
      }
    }
    if (tryRevenge(world, officer)) {
      continue;
    }
    tryRecruit(world, officer);
    tryRoamActions(world, officer, rngWeightedWander(world, officer));
  }

  socialPass(world, busy);
  agingPass(world);
}

// ---- 出奔と集団離反: 腐敗と怨恨が忠義を上回った時、人は野に走る ----
function tryDefect(world: World, officer: Officer, names: NameRegistry): boolean {
  const faction = factionOf(world, officer);
  if (faction === undefined || faction.leader === officer.id) {
    return false;
  }
  let worstGrudge = 0;
  let worstTargetId: string | undefined;
  for (const memberId of faction.members) {
    const score = grudgeScore(officer, memberId);
    if (score > worstGrudge) {
      worstGrudge = score;
      worstTargetId = memberId;
    }
  }
  const disgust =
    (faction.corruption / 100) * officer.values.altruism * 0.35 +
    worstGrudge * 0.55 -
    officer.values.loyalty * 0.6;
  if (disgust <= 15 + world.rng.range(0, 25)) {
    return false;
  }

  const causes: string[] =
    worstTargetId !== undefined
      ? (officer.rel.get(worstTargetId)?.grudges.slice(-2) ?? [])
      : [];
  const defectEvent = emit(world, {
    kind: "life.defect",
    loc: officer.loc,
    actors: [officer.id],
    factions: [faction.id],
    causes,
    data: { officer: officer.id },
  });
  faction.members = faction.members.filter((m) => m !== officer.id);
  delete officer.factionId;
  officer.status = "roaming";
  officer.fameOutlaw = Math.min(100, officer.fameOutlaw + 8);

  // 義兄弟や親友が同じ地にいれば、袂を連ねて去る（桃園の如き集団出奔）
  const companions = officersAt(world, officer.loc).filter((o) => {
    if (o.id === officer.id || o.factionId !== faction.id || o.id === faction.leader) {
      return false;
    }
    const rel = getRelation(o, officer.id);
    return (rel.bond === "sworn" || rel.affinity >= 60) && o.values.loyalty <= 70;
  });
  if (companions.length > 0) {
    for (const companion of companions) {
      faction.members = faction.members.filter((m) => m !== companion.id);
      delete companion.factionId;
      companion.status = "roaming";
    }
    emit(world, {
      kind: "life.desert",
      loc: officer.loc,
      actors: [officer.id, ...companions.map((c) => c.id)],
      factions: [faction.id],
      causes: [defectEvent.id],
      data: {},
    });
    foundRoamingBand(world, officer, companions, names);
  }
  return true;
}

export function foundRoamingBand(
  world: World,
  leader: Officer,
  members: Officer[],
  names: NameRegistry,
): void {
  const factionId = nextId(world, "f");
  world.factions.set(factionId, {
    id: factionId,
    kind: "roaming",
    leader: leader.id,
    members: [leader.id, ...members.map((m) => m.id)],
    cities: [],
    loc: leader.loc,
    gold: leader.gold,
    policy: "seeklair",
    corruption: 15,
    legitimacy: 10,
    feud: new Map(),
    foundedTick: world.tick,
  });
  names.registerBand(factionId, leader.id, world.tick);
  leader.factionId = factionId;
  leader.status = "roaming";
  for (const member of members) {
    member.factionId = factionId;
    member.status = "roaming";
  }
}

// ---- 復讐: 怨恨は時を越えて牙を剥く ----
function tryRevenge(world: World, officer: Officer): boolean {
  let top: { targetId: string; score: number } | undefined;
  for (const [targetId, rel] of officer.rel) {
    if (rel.grudges.length === 0) {
      continue;
    }
    const target = world.officers.get(targetId);
    if (target === undefined || target.status === "dead") {
      continue;
    }
    const score = grudgeScore(officer, targetId);
    if (top === undefined || score > top.score) {
      top = { targetId, score };
    }
  }
  if (top === undefined || top.score < 50 || officer.values.aggression < 50) {
    return false;
  }
  const target = world.officers.get(top.targetId);
  if (target === undefined) {
    return false;
  }

  if (chebyshev(target.pos, officer.pos) <= 1 && target.status !== "prisoner") {
    const causes = officer.rel.get(target.id)?.grudges.slice(-2) ?? [];
    const attackRoll = officer.aptitudes.valor + officer.aptitudes.craft * 0.4 + world.rng.range(0, 40);
    const defendRoll = target.aptitudes.valor + world.rng.range(0, 40);
    if (attackRoll > defendRoll) {
      const fatal = world.rng.chance(0.3);
      emit(world, {
        kind: "life.revenge",
        loc: officer.loc,
        at: { x: officer.pos.x, y: officer.pos.y },
        actors: [officer.id, target.id],
        causes,
        data: { avenger: officer.id, victim: target.id, killer: officer.id, fatal },
      });
      if (fatal) {
        killOfficer(world, target);
        world.corpses.push({ x: target.pos.x, y: target.pos.y, tick: world.tick });
      } else {
        target.hp = Math.max(1, target.hp - 40);
        officer.rel.get(target.id)?.grudges.splice(0);
      }
      officer.fameOutlaw = Math.min(100, officer.fameOutlaw + 6);
      return true;
    }
    emit(world, {
      kind: "life.duel",
      loc: officer.loc,
      at: { x: officer.pos.x, y: officer.pos.y },
      actors: [target.id, officer.id],
      causes,
      data: { winner: target.id, loser: officer.id },
    });
    officer.hp = Math.max(1, officer.hp - 30);
    return true;
  }

  // 怨みが深ければ仇を追って旅に出る
  if (top.score >= 70 && officer.values.aggression >= 65 && officer.status !== "serving") {
    return startJourney(world, officer, target.loc, 1.1);
  }
  return false;
}

// ---- 招賢: 一党の頭領は同じ地の豪傑を誘う ----
function tryRecruit(world: World, officer: Officer): void {
  const faction = factionOf(world, officer);
  if (faction === undefined || faction.leader !== officer.id) {
    return;
  }
  if (faction.kind !== "roaming" && faction.kind !== "outlaw") {
    return;
  }
  const candidates = officersAt(world, officer.loc).filter(
    (o) => o.id !== officer.id && o.factionId === undefined && o.status !== "prisoner",
  );
  for (const candidate of candidates) {
    const rel = getRelation(candidate, officer.id);
    const hasCourtGrudge = [...candidate.rel.values()].some((r) => r.grudges.length > 0);
    const fit =
      candidate.fameOutlaw * 0.3 +
      (100 - candidate.values.loyalty) * 0.25 +
      rel.affinity * 0.5 +
      officer.aptitudes.charisma * 0.3 +
      (hasCourtGrudge ? 20 : 0);
    if (fit > 65 && world.rng.chance(0.6)) {
      candidate.factionId = faction.id;
      candidate.status = faction.cities.length > 0 ? "serving" : "roaming";
      faction.members.push(candidate.id);
      emit(world, {
        kind: "life.recruit",
        loc: officer.loc,
        actors: [officer.id, candidate.id],
        factions: [faction.id],
        data: { leader: officer.id, joiner: candidate.id },
      });
    }
  }
}

function rngWeightedWander(world: World, officer: Officer): string | undefined {
  const neighbors = [...world.places.keys()].filter((pid) => {
    if (pid === officer.loc) {
      return false;
    }
    const d = chebyshev(officer.pos, placePos(world, pid));
    return d <= 34; // 一月で歩ける距離感の土地
  });
  if (neighbors.length === 0) {
    return undefined;
  }
  return world.rng.pickWeighted(neighbors, (n) => {
    const place = world.places.get(n);
    if (place === undefined) {
      return 1;
    }
    const near = chebyshev(officer.pos, placePos(world, n)) <= 22 ? 2 : 1;
    if (place.kind === "pass" || place.kind === "port" || place.kind === "town") {
      return 3 * near;
    }
    if (place.kind === "lairsite" || place.kind === "marsh") {
      return (officer.fameOutlaw >= 30 ? 3 : 1) * near;
    }
    return 2 * near;
  });
}

// ---- 浪人の行動: 放浪・辻強盗・緑林入り ----
function tryRoamActions(world: World, officer: Officer, wanderTarget: string | undefined): void {
  if (officer.factionId !== undefined) {
    return; // 一党の移動は勢力AIが決める
  }
  if (officer.status !== "roaming" && officer.status !== "free") {
    return;
  }
  const here = world.places.get(officer.loc);

  // 手癖の悪い者は街道に立つ
  if (
    here !== undefined &&
    (here.kind === "pass" || here.kind === "port") &&
    officer.values.aggression >= 60 &&
    officer.values.acquisition >= 45 &&
    world.rng.chance(0.3)
  ) {
    officer.gold += 10;
    officer.fameOutlaw = Math.min(100, officer.fameOutlaw + 3);
    here.order = Math.max(0, here.order - 3);
    emit(world, {
      kind: "life.raid-travelers",
      loc: officer.loc,
      actors: [officer.id],
      data: { actor: officer.id },
    });
    return;
  }

  // 同地の緑林・放浪の一党に身を投じる（怨みか名声が背中を押す）
  const bandsHere = [...world.factions.values()].filter((f) => {
    if (f.fallenTick !== undefined || (f.kind !== "outlaw" && f.kind !== "roaming")) {
      return false;
    }
    const at = f.kind === "roaming" ? f.loc : f.cities[0];
    return at === officer.loc;
  });
  const hasGrudges = [...officer.rel.values()].some((r) => r.grudges.length >= 1);
  const band = bandsHere[0];
  if (band !== undefined && (hasGrudges || officer.fameOutlaw >= 45) && world.rng.chance(0.5)) {
    officer.factionId = band.id;
    officer.status = band.cities.length > 0 ? "serving" : "roaming";
    band.members.push(officer.id);
    emit(world, {
      kind: "life.join",
      loc: officer.loc,
      actors: [officer.id, band.leader],
      factions: [band.id],
      data: { joiner: officer.id, leader: band.leader },
    });
    return;
  }

  if (wanderTarget !== undefined && world.rng.chance(0.6)) {
    startJourney(world, officer, wanderTarget);
  }
}

// ---- 社交: 出会い・酒宴・口論・義盟は「場」で起きる ----
function socialPass(world: World, busy: Set<string>): void {
  const rng = world.rng;
  const byPlace = new Map<string, Officer[]>();
  for (const officer of livingOfficers(world)) {
    if (officer.status === "dead" || officer.status === "prisoner" || busy.has(officer.id)) {
      continue;
    }
    if (officer.journey !== undefined) {
      continue; // 旅の空の下（社交は場に着いてから）
    }
    const list = byPlace.get(officer.loc) ?? [];
    list.push(officer);
    byPlace.set(officer.loc, list);
  }

  for (const [placeId, group] of byPlace) {
    if (group.length < 2) {
      continue;
    }

    // 初対面: 価値観が響き合えば友誼、噛み合わねば互いに鼻白む
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i] as Officer;
        const b = group[j] as Officer;
        if (a.rel.has(b.id) || b.rel.has(a.id)) {
          continue;
        }
        const diff =
          Math.abs(a.values.altruism - b.values.altruism) +
          Math.abs(a.values.aggression - b.values.aggression) +
          Math.abs(a.values.acquisition - b.values.acquisition);
        let impression = Math.floor((90 - diff) / 3);
        if (a.aptitudes.valor >= 80 && b.aptitudes.valor >= 80) {
          impression += 12; // 豪傑は豪傑を知る
        }
        getRelation(a, b.id).affinity = impression;
        getRelation(b, a.id).affinity = impression;
        if (Math.abs(impression) >= 8) {
          emit(world, {
            kind: "life.meet",
            loc: placeId,
            actors: [a.id, b.id],
            data: {},
          });
        }
      }
    }

    // 酒宴: 杯は友情も遺恨も生む
    if (group.length >= 2 && rng.chance(0.3)) {
      const guests = rng.shuffle(group).slice(0, 6);
      const feastEvent = emit(world, {
        kind: "life.feast",
        loc: placeId,
        actors: guests.map((g) => g.id),
        data: {},
      });
      if (guests.length >= 2 && rng.chance(0.35)) {
        const pair = rng.shuffle(guests).slice(0, 2) as [Officer, Officer];
        const [a, b] = pair;
        const friction =
          (a.values.aggression + b.values.aggression) / 2 +
          (a.values.face + b.values.face) / 4 -
          (getRelation(a, b.id).affinity + getRelation(b, a.id).affinity) / 2;
        if (friction > 55) {
          emit(world, {
            kind: "life.quarrel",
            loc: placeId,
            actors: [a.id, b.id],
            causes: [feastEvent.id],
            data: { deep: friction > 75 },
          });
        }
      }
    }

    // 義盟: 肝胆相照らした者たちは香を焚く（結び過ぎれば義の重みが消える）
    const swornCount = (o: Officer): number =>
      [...o.rel.values()].filter((r) => r.bond === "sworn").length;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i] as Officer;
        const b = group[j] as Officer;
        const relA = getRelation(a, b.id);
        const relB = getRelation(b, a.id);
        if (relA.bond !== undefined || relB.bond !== undefined) {
          continue;
        }
        if (swornCount(a) >= 3 || swornCount(b) >= 3) {
          continue;
        }
        if (
          relA.affinity >= 62 &&
          relB.affinity >= 62 &&
          a.values.attachment + a.values.altruism >= 100 &&
          b.values.attachment + b.values.altruism >= 100 &&
          rng.chance(0.12)
        ) {
          emit(world, {
            kind: "life.oath",
            loc: placeId,
            actors: [a.id, b.id],
            data: {},
          });
        }
      }
    }
  }
}

// ---- 老いと病: 人生は続き、そして終わる（月次） ----
function agingPass(world: World): void {
  const isYearHead = monthOf(world.tick) === 12;
  for (const officer of livingOfficers(world)) {
    if (isYearHead) {
      officer.age += 1;
    }
    const p = officer.age >= 60 ? 0.01 : officer.age >= 50 ? 0.003 : 0.0004;
    if (world.rng.chance(p)) {
      emit(world, {
        kind: "life.illness-death",
        loc: officer.loc,
        actors: [officer.id],
        data: { officer: officer.id, age: officer.age },
      });
      killOfficer(world, officer);
    }
  }
}

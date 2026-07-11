// 責務: 全国戦場（裁定R-17）。戦争画面は無い——世界そのものが戦場である
// 交戦は世界タイルの上で日々進行し、どの勢力も途中参加・離脱できる。技は必ず世界へ作用し、ダメージは副産物にすぎない
import { emit } from "./events";
import { disbandArmy, handleCaptive, killOfficer, resolveCityFall } from "./fate";
import type { XY } from "./grid";
import { T, burnRate, chebyshev, isFlammable, stepOneTile } from "./grid";
import type {
  Army,
  ArmyUnit,
  Battle,
  EventId,
  NameRegistry,
  Officer,
  Place,
  SkillId,
  World,
} from "./model";
import { armyTroops, nextId, placePos } from "./model";
import type { Rng } from "./rng";

const ENGAGE_RANGE = 6; // この距離まで近づいた敵対軍は交戦に入る
const SIEGE_RANGE = 3; // 城への攻撃開始距離
const FLEE_ESCAPE = 9; // 敗走兵がこの距離まで逃げれば戦場を離れる

interface UnitRef {
  army: Army;
  unit: ArmyUnit;
  officer: Officer;
}

// 斜め移動は禁止。縦横4方向のみの候補（距離の大きい軸を優先し、詰まれば別の軸へ）
const SCATTER_DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];

function axisCandidates(x: number, y: number, tx: number, ty: number, rng: Rng): XY[] {
  const dxAbs = Math.abs(tx - x);
  const dyAbs = Math.abs(ty - y);
  const dxSign = Math.sign(tx - x);
  const dySign = Math.sign(ty - y);
  const primary: XY = dxAbs >= dyAbs ? { x: x + dxSign, y } : { x, y: y + dySign };
  const secondary: XY = dxAbs >= dyAbs ? { x, y: y + dySign } : { x: x + dxSign, y };
  return [
    primary,
    secondary,
    { x: x + rng.pick([-1, 1]), y },
    { x, y: y + rng.pick([-1, 1]) },
  ];
}

function hostile(a: Army, b: Army): boolean {
  return a.factionId !== b.factionId;
}

function activeUnits(world: World, army: Army): ArmyUnit[] {
  return army.units.filter((u) => !u.gone);
}

function unitRefsOf(world: World, battle: Battle): UnitRef[] {
  const refs: UnitRef[] = [];
  for (const army of world.armies) {
    if (army.battleId !== battle.id) {
      continue;
    }
    for (const unit of activeUnits(world, army)) {
      const officer = world.officers.get(unit.officerId);
      if (officer !== undefined && officer.status !== "dead") {
        refs.push({ army, unit, officer });
      }
    }
  }
  return refs;
}

function unitAt(refs: UnitRef[], x: number, y: number): UnitRef | undefined {
  return refs.find((r) => !r.unit.gone && r.unit.x === x && r.unit.y === y);
}

function damageUnit(ref: UnitRef, lossRatio: number, moraleHit: number): void {
  const loss = Math.floor(ref.unit.troops * lossRatio);
  ref.unit.troops = Math.max(0, ref.unit.troops - loss);
  ref.unit.morale -= moraleHit + (loss / Math.max(1, ref.unit.troopsMax)) * 40;
  ref.officer.hp = Math.max(0, ref.officer.hp - Math.floor(lossRatio * 12));
}

// ---- 軍の展開と参戦 ----

// 軍旗の周囲へ各隊を散開させる
export function deployUnits(world: World, army: Army): void {
  const offsets: Array<[number, number]> = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2],
  ];
  let cursor = 0;
  for (const unit of army.units) {
    if (unit.gone) {
      continue;
    }
    for (; cursor < offsets.length; cursor += 1) {
      const [dx, dy] = offsets[cursor] as [number, number];
      const x = army.x + dx;
      const y = army.y + dy;
      if (world.grid.passable(x, y)) {
        unit.x = x;
        unit.y = y;
        cursor += 1;
        break;
      }
    }
    if (cursor >= offsets.length) {
      unit.x = army.x;
      unit.y = army.y;
    }
  }
}

export function makeUnits(officers: Officer[], troops: number): ArmyUnit[] {
  const per = Math.max(30, Math.floor(troops / Math.max(1, officers.length)));
  return officers.map((officer) => ({
    officerId: officer.id,
    x: officer.pos.x,
    y: officer.pos.y,
    troops: per,
    troopsMax: per,
    morale: 70 + officer.aptitudes.leadership * 0.3,
    hidden: false,
    tauntTicks: 0,
    routed: false,
    gone: false,
    usedSkills: [],
  }));
}

function joinBattle(world: World, army: Army, battle: Battle): void {
  if (army.battleId === battle.id) {
    return;
  }
  const wasFighting = army.battleId !== undefined;
  army.battleId = battle.id;
  army.state = "fight";
  if (!battle.factions.includes(army.factionId)) {
    battle.factions.push(army.factionId);
    if (!wasFighting) {
      // 横槍・漁夫の利: 進行中の戦場へ第三勢力が乱入する
      emit(world, {
        kind: "war.join",
        at: { x: army.x, y: army.y },
        ...(battle.placeId !== undefined ? { loc: battle.placeId } : {}),
        actors: army.units.map((u) => u.officerId),
        factions: [army.factionId],
        causes: [battle.eventId],
        data: { battleId: battle.id },
      });
    }
  }
  deployUnits(world, army);
}

// 城の守備軍を興す（在城武将が城兵を率いて城内に展開する）
function raiseGarrison(world: World, place: Place, battle: Battle, names: NameRegistry): void {
  const owner = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
  if (owner === undefined || owner.fallenTick !== undefined) {
    return;
  }
  if (world.armies.some((a) => a.factionId === owner.id && a.battleId === battle.id)) {
    return;
  }
  const inArmies = new Set(world.armies.flatMap((a) => a.units.map((u) => u.officerId)));
  const defenders = [...world.officers.values()]
    .filter(
      (o) =>
        o.factionId === owner.id &&
        (o.status === "serving" || o.status === "roaming") &&
        o.loc === place.id &&
        o.journey === undefined &&
        !inArmies.has(o.id),
    )
    .sort((a, b) => b.aptitudes.leadership - a.aptitudes.leadership)
    .slice(0, 6);
  if (defenders.length === 0) {
    return; // 采配なき籠城: 城壁と城兵だけで抗う
  }
  const fielded = Math.floor(place.garrison * 0.7);
  place.garrison -= fielded;
  const army: Army = {
    id: nextId(world, "a"),
    factionId: owner.id,
    units: makeUnits(defenders, Math.max(120, fielded)),
    x: place.gridX,
    y: place.gridY,
    mp: 0,
    path: [],
    trail: [],
    target: place.id,
    goal: "suppress",
    state: "fight",
    battleId: battle.id,
    causeEvent: battle.eventId,
  };
  world.armies.push(army);
  deployUnits(world, army);
  void names;
}

// ---- 交戦の発見: 敵対する軍が近づけば、そこが戦場になる ----
export function detectBattles(world: World, names: NameRegistry): void {
  // 1) 軍同士の遭遇
  for (let i = 0; i < world.armies.length; i += 1) {
    for (let j = i + 1; j < world.armies.length; j += 1) {
      const a = world.armies[i] as Army;
      const b = world.armies[j] as Army;
      if (!hostile(a, b)) {
        continue;
      }
      if (chebyshev(a, b) > ENGAGE_RANGE) {
        continue;
      }
      const existing =
        world.battles.find((bt) => bt.id === a.battleId) ??
        world.battles.find((bt) => bt.id === b.battleId);
      if (existing !== undefined) {
        joinBattle(world, a, existing);
        joinBattle(world, b, existing);
        continue;
      }
      const midX = Math.floor((a.x + b.x) / 2);
      const midY = Math.floor((a.y + b.y) / 2);
      const ev = emit(world, {
        kind: "war.encounter",
        at: { x: midX, y: midY },
        actors: [...a.units.map((u) => u.officerId), ...b.units.map((u) => u.officerId)],
        factions: [a.factionId, b.factionId],
        causes: [a.causeEvent, b.causeEvent],
        data: {},
      });
      const battle: Battle = {
        id: nextId(world, "b"),
        startTick: world.tick,
        x: midX,
        y: midY,
        factions: [a.factionId, b.factionId],
        siege: false,
        eventId: ev.id,
        lastClashTick: world.tick,
        duelPairs: [],
      };
      world.battles.push(battle);
      joinBattle(world, a, battle);
      joinBattle(world, b, battle);
    }
  }

  // 2) 攻城: 目標の城に迫った軍は城攻めを開く
  for (const army of world.armies) {
    if (army.state !== "march") {
      continue;
    }
    const place = world.places.get(army.target);
    if (place === undefined) {
      continue;
    }
    if (chebyshev(army, placePos(world, place.id)) > SIEGE_RANGE) {
      continue;
    }
    const owner = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
    const isHostileCity = owner !== undefined && owner.id !== army.factionId;
    const resists = isHostileCity || place.garrison > 150;
    if (!resists) {
      continue; // 無血入城は行軍側（strategy）が裁く
    }
    let battle = world.battles.find((bt) => bt.placeId === place.id);
    if (battle === undefined) {
      const ev = emit(world, {
        kind: "war.siege",
        loc: place.id,
        at: { x: place.gridX, y: place.gridY },
        actors: army.units.map((u) => u.officerId),
        factions: owner !== undefined ? [army.factionId, owner.id] : [army.factionId],
        causes: [army.causeEvent],
        data: {},
      });
      battle = {
        id: nextId(world, "b"),
        startTick: world.tick,
        x: place.gridX,
        y: place.gridY,
        factions: [army.factionId],
        placeId: place.id,
        siege: true,
        eventId: ev.id,
        lastClashTick: world.tick,
        duelPairs: [],
      };
      world.battles.push(battle);
      if (!place.gateBroken) {
        place.gateHp = Math.max(place.gateHp, place.defense * 3);
      }
    }
    joinBattle(world, army, battle);
    raiseGarrison(world, place, battle, names);
  }
}

// ---- 延焼: 火は風に乗って世界を書き換える。都市へも森へも燃え広がる ----
export function stepFires(world: World): void {
  const grid = world.grid;
  const rng = world.rng;
  const igniting: XY[] = [];
  for (const [idx, fire] of grid.fires) {
    const { x, y } = grid.xyOf(idx);
    // 火中の部隊は焼かれる
    for (const army of world.armies) {
      for (const unit of activeUnits(world, army)) {
        if (unit.x === x && unit.y === y) {
          const officer = world.officers.get(unit.officerId);
          if (officer !== undefined) {
            damageUnit({ army, unit, officer }, 0.09, 12);
            if (fire.igniterId !== undefined && fire.igniterId !== unit.officerId && rng.chance(0.35)) {
              emit(world, {
                kind: "clash.burn",
                at: { x, y },
                actors: [unit.officerId],
                causes: [fire.causeEvent],
                data: { victim: unit.officerId, culprit: fire.igniterId, victimSide: "enemy" },
              });
            }
          }
        }
      }
    }
    // 都市の敷地が燃えれば戦禍が刻まれ、住民が逃げる
    const cityId = world.cityTiles.get(idx);
    if (cityId !== undefined) {
      const place = world.places.get(cityId);
      if (place !== undefined) {
        place.devastation = Math.min(100, place.devastation + 1.5);
        place.population = Math.max(3, place.population - 0.4);
        place.sentiment = Math.max(0, place.sentiment - 1);
      }
    }
    // 風下へ延焼する
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) {
        continue;
      }
      const ni = grid.idx(nx, ny);
      if (grid.fires.has(ni)) {
        continue;
      }
      const t = grid.at(nx, ny);
      let p = burnRate(t);
      if (p <= 0) {
        continue;
      }
      if (dx === world.wind.x && dy === world.wind.y) {
        p += 0.22;
      }
      if (rng.chance(p)) {
        igniting.push({ x: nx, y: ny });
      }
    }
    fire.left -= 1;
    if (fire.left <= 0) {
      grid.fires.delete(idx);
      const t = grid.at(x, y);
      if (t === T.gate) {
        breachGateAt(world, x, y, fire.causeEvent);
      } else if (t !== T.city) {
        grid.scar(x, y, "burnt", world.tick);
      } else {
        grid.dirty.push(idx);
      }
    }
  }
  for (const spot of igniting) {
    const src = grid.fires.values().next().value;
    igniteCell(world, spot.x, spot.y, 2, src?.causeEvent ?? "", src?.igniterId);
  }
}

export function igniteCell(
  world: World,
  x: number,
  y: number,
  power: number,
  causeEvent: EventId,
  igniterId?: string,
): boolean {
  const grid = world.grid;
  if (!grid.inBounds(x, y)) {
    return false;
  }
  const idx = grid.idx(x, y);
  const t = grid.at(x, y);
  if (!isFlammable(t) || grid.fires.has(idx)) {
    return false;
  }
  grid.fires.set(idx, {
    left: 2 + Math.floor(power),
    causeEvent,
    ...(igniterId !== undefined ? { igniterId } : {}),
  });
  grid.dirty.push(idx);
  return true;
}

// 城門が破れる。門は焼け落ち、道が開く
function breachGateAt(world: World, x: number, y: number, causeId: EventId): void {
  const idx = world.grid.idx(x, y);
  const placeId = world.cityTiles.get(idx);
  world.grid.set(x, y, T.burnt);
  if (placeId === undefined) {
    return;
  }
  const place = world.places.get(placeId);
  if (place === undefined || place.gateBroken) {
    return;
  }
  place.gateBroken = true;
  place.gateHp = 0;
  place.defense = Math.max(5, place.defense - 6);
  // 他の門も同時に開く（防衛線の崩壊）
  const walls = world.walls.get(placeId);
  if (walls !== undefined) {
    for (const gate of walls.gates) {
      if (world.grid.at(gate.x, gate.y) === T.gate) {
        world.grid.set(gate.x, gate.y, T.burnt);
      }
    }
  }
  emit(world, {
    kind: "war.gate-breach",
    loc: placeId,
    at: { x, y },
    causes: [causeId],
    data: {},
  });
}

// ---- 矢の雨: 投射物は世界に残り、そこへ入った者を勢力を問わず貫く ----
export function stepVolleys(world: World): void {
  const rng = world.rng;
  for (const volley of [...world.volleys]) {
    volley.left -= 1;
    for (const c of volley.cells) {
      // 部隊への命中（敵味方を問わない——流れ矢が怨恨を生む）
      for (const army of world.armies) {
        for (const unit of activeUnits(world, army)) {
          if (chebyshev(unit, c) > 1) {
            continue;
          }
          const officer = world.officers.get(unit.officerId);
          if (officer === undefined || unit.officerId === volley.shooterId) {
            continue;
          }
          const direct = unit.x === c.x && unit.y === c.y;
          if (!direct && !rng.chance(0.3)) {
            continue;
          }
          damageUnit({ army, unit, officer }, direct ? 0.05 : 0.03, direct ? 6 : 4);
          if (!direct) {
            emit(world, {
              kind: "clash.stray",
              at: { x: unit.x, y: unit.y },
              actors: [volley.shooterId, unit.officerId],
              causes: [volley.causeEvent],
              data: {
                culprit: volley.shooterId,
                victim: unit.officerId,
                victimSide: army.factionId === volley.factionId ? "ally" : "enemy",
              },
            });
          }
        }
      }
      // 通りすがりの旅人にも当たる（巻き込み）
      for (const traveler of world.officers.values()) {
        if (traveler.journey === undefined || traveler.status === "dead") {
          continue;
        }
        if (chebyshev(traveler.pos, c) <= 1 && rng.chance(0.12)) {
          traveler.hp = Math.max(1, traveler.hp - 18);
          emit(world, {
            kind: "clash.stray",
            at: { x: traveler.pos.x, y: traveler.pos.y },
            actors: [volley.shooterId, traveler.id],
            causes: [volley.causeEvent],
            data: { culprit: volley.shooterId, victim: traveler.id, victimSide: "bystander" },
          });
        }
      }
      // 火矢は森に刺さり燃える
      if (world.grid.at(c.x, c.y) === T.forest && rng.chance(0.05)) {
        igniteCell(world, c.x, c.y, 1, volley.causeEvent, volley.shooterId);
      }
    }
    if (volley.left <= 0) {
      world.volleys = world.volleys.filter((v) => v !== volley);
    }
  }
}

// ---- 戦場の一日 ----
export function stepBattles(world: World, names: NameRegistry): void {
  for (const battle of [...world.battles]) {
    stepBattle(world, battle, names);
  }
  world.battles = world.battles.filter((b) => world.armies.some((a) => a.battleId === b.id));
  // 亡骸は歳月で朽ちる
  if (world.corpses.length > 400) {
    world.corpses.splice(0, world.corpses.length - 400);
  }
}

function stepBattle(world: World, battle: Battle, names: NameRegistry): void {
  const rng = world.rng;
  const refs = unitRefsOf(world, battle);
  const place = battle.placeId !== undefined ? world.places.get(battle.placeId) : undefined;

  // 重心の更新（描画・追跡用）
  if (refs.length > 0) {
    battle.x = Math.round(refs.reduce((s, r) => s + r.unit.x, 0) / refs.length);
    battle.y = Math.round(refs.reduce((s, r) => s + r.unit.y, 0) / refs.length);
  }

  const emitB = (
    kind: string,
    actors: string[],
    at: XY,
    data: Record<string, unknown>,
    causes: EventId[] = [battle.eventId],
  ): EventId => {
    const e = emit(world, {
      kind,
      at,
      ...(battle.placeId !== undefined ? { loc: battle.placeId } : {}),
      actors,
      factions: battle.factions,
      causes,
      data,
    });
    return e.id;
  };

  const enemiesOf = (me: UnitRef): UnitRef[] =>
    refs.filter(
      (r) =>
        !r.unit.gone &&
        r.army.factionId !== me.army.factionId &&
        !(r.unit.hidden && chebyshev(me.unit, r.unit) > 1),
    );

  const stepToward = (me: UnitRef, tx: number, ty: number): void => {
    const u = me.unit;
    const candidates = axisCandidates(u.x, u.y, tx, ty, rng);
    for (const c of candidates) {
      if ((c.x === u.x && c.y === u.y) || !world.grid.inBounds(c.x, c.y)) {
        continue;
      }
      if (!world.grid.passable(c.x, c.y)) {
        continue;
      }
      if (world.grid.fires.has(world.grid.idx(c.x, c.y))) {
        continue;
      }
      // 閉じた敵城の門は越えられない
      if (isSealedGate(world, c.x, c.y, me.army.factionId)) {
        continue;
      }
      if (unitAt(refs, c.x, c.y) !== undefined) {
        continue;
      }
      u.x = c.x;
      u.y = c.y;
      return;
    }
  };

  const knockback = (attacker: UnitRef, target: UnitRef, dx: number, dy: number, causeId: EventId): void => {
    // 押し出す向きは縦横いずれか一方（斜め移動禁止）。距離の大きい軸を選ぶ
    const pushX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
    const pushY = pushX === 0 ? Math.sign(dy) : 0;
    let into = "ground";
    for (let s = 0; s < 2; s += 1) {
      const nx = target.unit.x + pushX;
      const ny = target.unit.y + pushY;
      if (!world.grid.inBounds(nx, ny)) {
        break;
      }
      const blocker = unitAt(refs, nx, ny);
      if (blocker !== undefined) {
        into = blocker.army.factionId === attacker.army.factionId ? "ally" : "unit";
        damageUnit(blocker, 0.06, 8);
        damageUnit(target, 0.06, 8);
        // 将棋倒し: 突き当たった隊も、その先が空いていれば共に押し出される
        const bx = blocker.unit.x + pushX;
        const by = blocker.unit.y + pushY;
        if (
          world.grid.inBounds(bx, by) &&
          world.grid.passable(bx, by) &&
          unitAt(refs, bx, by) === undefined &&
          !world.grid.fires.has(world.grid.idx(bx, by))
        ) {
          blocker.unit.x = bx;
          blocker.unit.y = by;
          emitB("clash.knockback", [attacker.officer.id, blocker.officer.id], { x: bx, y: by }, {
            attacker: attacker.officer.id,
            target: blocker.officer.id,
            into: "domino",
          }, [causeId]);
        }
        break;
      }
      const t = world.grid.at(nx, ny);
      if (t === T.wall || t === T.mountain || t === T.rubble) {
        damageUnit(target, 0.05, 6);
        into = "wall";
        break;
      }
      if (t === T.river || t === T.sea) {
        target.unit.x = nx;
        target.unit.y = ny;
        into = "water";
        break;
      }
      target.unit.x = nx;
      target.unit.y = ny;
      if (world.grid.fires.has(world.grid.idx(nx, ny))) {
        into = "fire";
        break;
      }
    }
    const kbId = emitB(
      "clash.knockback",
      [attacker.officer.id, target.officer.id],
      { x: target.unit.x, y: target.unit.y },
      { attacker: attacker.officer.id, target: target.officer.id, into },
      [causeId],
    );
    if (into === "water") {
      damageUnit(target, 0.28, 30);
      emitB("clash.drown", [target.officer.id], { x: target.unit.x, y: target.unit.y }, { victim: target.officer.id }, [kbId]);
      // 岸へ這い上がる
      const back = { x: target.unit.x - pushX, y: target.unit.y - pushY };
      if (world.grid.passable(back.x, back.y) && unitAt(refs, back.x, back.y) === undefined) {
        target.unit.x = back.x;
        target.unit.y = back.y;
      }
    } else if (into === "fire") {
      damageUnit(target, 0.18, 22);
      emitB(
        "clash.burn",
        [target.officer.id],
        { x: target.unit.x, y: target.unit.y },
        { victim: target.officer.id, culprit: attacker.officer.id, victimSide: "enemy" },
        [kbId],
      );
    }
  };

  const fellUnit = (me: UnitRef, killer: UnitRef | undefined): void => {
    me.unit.gone = true;
    world.corpses.push({ x: me.unit.x, y: me.unit.y, tick: world.tick });
    if (killer !== undefined && rng.chance(0.35)) {
      emitB("clash.fall", [me.officer.id], { x: me.unit.x, y: me.unit.y }, {
        victim: me.officer.id,
        killer: killer.officer.id,
      });
      killOfficer(world, me.officer);
      return;
    }
    if (killer !== undefined) {
      const capId = emitB("clash.capture", [me.officer.id], { x: me.unit.x, y: me.unit.y }, {
        victim: me.officer.id,
        captor: killer.officer.id,
      });
      const captorFaction = world.factions.get(killer.army.factionId);
      if (captorFaction !== undefined) {
        handleCaptive(world, me.officer.id, captorFaction, capId);
      }
      return;
    }
    // 隊が壊滅しても将は落ち延びる
    escapeHome(world, me.officer);
  };

  const maybeRescue = (target: UnitRef, causeId: EventId): void => {
    if (target.unit.troops > target.unit.troopsMax * 0.2 && target.officer.hp > 15) {
      return;
    }
    const savior = refs.find(
      (r) =>
        !r.unit.gone &&
        !r.unit.routed &&
        r.army.factionId === target.army.factionId &&
        r !== target &&
        chebyshev(r.unit, target.unit) <= 2,
    );
    if (savior !== undefined && rng.chance(0.5)) {
      target.unit.morale += 15;
      target.unit.troops += Math.floor(savior.unit.troops * 0.1);
      savior.unit.troops = Math.floor(savior.unit.troops * 0.9);
      emitB(
        "clash.rescue",
        [savior.officer.id, target.officer.id],
        { x: target.unit.x, y: target.unit.y },
        { savior: savior.officer.id, saved: target.officer.id },
        [causeId],
      );
    }
  };

  const duel = (a: UnitRef, b: UnitRef): void => {
    const rollA = a.officer.aptitudes.valor + rng.next() * 35;
    const rollB = b.officer.aptitudes.valor + rng.next() * 35;
    const rounds = 10 + rng.int(40);
    if (Math.abs(rollA - rollB) < 7) {
      emitB("clash.duel-respect", [a.officer.id, b.officer.id], { x: a.unit.x, y: a.unit.y }, { rounds });
      return;
    }
    const winner = rollA > rollB ? a : b;
    const loser = rollA > rollB ? b : a;
    const fatal = rng.chance(0.15);
    const dId = emitB("clash.duel", [winner.officer.id, loser.officer.id], { x: a.unit.x, y: a.unit.y }, {
      winner: winner.officer.id,
      loser: loser.officer.id,
      rounds,
      fatal,
    });
    winner.officer.fameOutlaw += winner.army.factionId === "court" ? 0 : 4;
    winner.officer.fameOfficial += 4;
    if (fatal) {
      loser.unit.gone = true;
      world.corpses.push({ x: loser.unit.x, y: loser.unit.y, tick: world.tick });
      emitB("clash.fall", [loser.officer.id], { x: loser.unit.x, y: loser.unit.y }, {
        victim: loser.officer.id,
        killer: winner.officer.id,
      }, [dId]);
      killOfficer(world, loser.officer);
    } else {
      loser.officer.hp = Math.max(1, loser.officer.hp - 35);
      loser.unit.morale -= 25;
      damageUnit(loser, 0.08, 10);
    }
  };

  const melee = (me: UnitRef, target: UnitRef): void => {
    const pairKey = [me.officer.id, target.officer.id].sort().join(":");
    if (
      me.officer.aptitudes.valor >= 70 &&
      target.officer.aptitudes.valor >= 70 &&
      !battle.duelPairs.includes(pairKey) &&
      rng.chance(0.3)
    ) {
      battle.duelPairs.push(pairKey);
      duel(me, target);
      return;
    }
    const guard = world.grid.at(target.unit.x, target.unit.y) === T.forest ? 0.75 : 1;
    const ratio = (0.05 + me.officer.aptitudes.valor * 0.0007) * guard * (me.unit.tauntTicks > 0 ? 1.2 : 1);
    damageUnit(target, ratio, 6);
    damageUnit(me, ratio * 0.45, 3);
    maybeRescue(target, battle.eventId);
    if (target.unit.troops <= 0 && !target.unit.gone) {
      fellUnit(target, me);
    }
  };

  const trySkill = (me: UnitRef, target: UnitRef): boolean => {
    const d = chebyshev(me.unit, target.unit);
    const used = (s: SkillId): boolean => me.unit.usedSkills.includes(s);
    const markUsed = (s: SkillId): void => {
      me.unit.usedSkills.push(s);
    };
    for (const skill of me.officer.skills) {
      if (used(skill)) {
        continue;
      }
      switch (skill) {
        case "taunt": {
          if (d <= 5 && target.officer.values.aggression >= 60 && !target.unit.routed && rng.chance(0.55)) {
            markUsed(skill);
            const resist = target.officer.values.caution + rng.next() * 40;
            const push = me.officer.aptitudes.intellect * 0.5 + me.officer.values.face * 0.3 + rng.next() * 40;
            if (push > resist) {
              target.unit.tauntTicks = 4;
              target.unit.tauntTargetId = me.officer.id;
              emitB("clash.taunt", [me.officer.id, target.officer.id], { x: me.unit.x, y: me.unit.y }, {
                taunter: me.officer.id,
                target: target.officer.id,
              });
              return true;
            }
          }
          break;
        }
        case "volley": {
          if (d >= 2 && d <= 5 && rng.chance(0.6)) {
            markUsed(skill);
            const vId = emitB("clash.volley", [me.officer.id], { x: me.unit.x, y: me.unit.y }, {
              shooter: me.officer.id,
              tx: target.unit.x,
              ty: target.unit.y,
            });
            const cells: XY[] = [
              { x: target.unit.x, y: target.unit.y },
              { x: target.unit.x + 1, y: target.unit.y },
              { x: target.unit.x - 1, y: target.unit.y },
            ].filter((c) => world.grid.inBounds(c.x, c.y));
            world.volleys.push({
              cells,
              left: 2,
              shooterId: me.officer.id,
              factionId: me.army.factionId,
              causeEvent: vId,
            });
            return true;
          }
          break;
        }
        case "fire": {
          const gateTarget = nearestSealedGate(world, place, me);
          const targetT = world.grid.at(target.unit.x, target.unit.y);
          if (d <= 4 && rng.chance(0.5) && (gateTarget !== undefined || isFlammable(targetT))) {
            markUsed(skill);
            const power = 1 + me.officer.aptitudes.intellect / 50;
            const fId = emitB("clash.fire", [me.officer.id], { x: me.unit.x, y: me.unit.y }, {
              arsonist: me.officer.id,
            });
            if (gateTarget !== undefined && place !== undefined) {
              igniteCell(world, gateTarget.x, gateTarget.y, power, fId, me.officer.id);
              place.gateHp -= power * 30;
            } else {
              igniteCell(world, target.unit.x, target.unit.y, power, fId, me.officer.id);
              igniteCell(world, target.unit.x + world.wind.x, target.unit.y + world.wind.y, power, fId, me.officer.id);
            }
            return true;
          }
          break;
        }
        case "sorcery": {
          const cluster = enemiesOf(me).filter((e) => chebyshev(e.unit, target.unit) <= 1);
          if (d <= 5 && cluster.length >= 2 && rng.chance(0.5)) {
            markUsed(skill);
            const sId = emitB("clash.sorcery", [me.officer.id], { x: target.unit.x, y: target.unit.y }, {
              caster: me.officer.id,
              mode: "storm",
            });
            for (const e of cluster) {
              damageUnit(e, 0.12, 18);
              // 散乱は縦横1マスのみ（斜め移動禁止）
              const [ddx, ddy] = rng.pick(SCATTER_DIRS);
              const nx = e.unit.x + ddx;
              const ny = e.unit.y + ddy;
              if (world.grid.passable(nx, ny) && unitAt(refs, nx, ny) === undefined) {
                e.unit.x = nx;
                e.unit.y = ny;
              }
              maybeRescue(e, sId);
            }
            return true;
          }
          break;
        }
        case "rockfall": {
          const nearHard = [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
          ].some(([dx, dy]) => {
            const t = world.grid.at(target.unit.x + (dx ?? 0), target.unit.y + (dy ?? 0));
            return t === T.mountain || t === T.wall;
          });
          if (d <= 4 && nearHard && rng.chance(0.6)) {
            markUsed(skill);
            const rId = emitB("clash.rockfall", [me.officer.id, target.officer.id], { x: target.unit.x, y: target.unit.y }, {
              actor: me.officer.id,
            });
            damageUnit(target, 0.25, 25);
            // 世界の地形が変わる: 瓦礫が道を塞ぐ
            world.grid.scar(target.unit.x, target.unit.y + 1, "rubble", world.tick);
            emitB("clash.terrain", [], { x: target.unit.x, y: target.unit.y + 1 }, { what: "rubble" }, [rId]);
            maybeRescue(target, rId);
            return true;
          }
          break;
        }
        case "ambush": {
          if (
            world.grid.at(me.unit.x, me.unit.y) === T.forest &&
            d > 2 &&
            !me.unit.hidden &&
            me.unit.usedSkills.length === 0 &&
            rng.chance(0.5)
          ) {
            markUsed(skill);
            me.unit.hidden = true;
            return true;
          }
          break;
        }
        case "charge": {
          if (d >= 1 && d <= 3 && rng.chance(0.55)) {
            markUsed(skill);
            const dx = target.unit.x - me.unit.x;
            const dy = target.unit.y - me.unit.y;
            for (let dash = 0; dash < 4 && chebyshev(me.unit, target.unit) > 1; dash += 1) {
              const bx = me.unit.x;
              const by = me.unit.y;
              stepToward(me, target.unit.x, target.unit.y);
              if (me.unit.x === bx && me.unit.y === by) {
                break;
              }
            }
            if (chebyshev(me.unit, target.unit) <= 1) {
              const cId = emitB("clash.charge", [me.officer.id, target.officer.id], { x: me.unit.x, y: me.unit.y }, {
                attacker: me.officer.id,
                target: target.officer.id,
              });
              damageUnit(target, 0.14 + me.officer.aptitudes.valor * 0.001, 16);
              knockback(me, target, dx, dy, cId);
              maybeRescue(target, cId);
            }
            return true;
          }
          break;
        }
        default:
          break;
      }
    }
    return false;
  };

  // ---- 部隊行動（武勇順。猪突の者は下知を待たない） ----
  const order = [...refs].sort((a, b) => b.officer.aptitudes.valor - a.officer.aptitudes.valor);
  for (const me of order) {
    if (me.unit.gone || me.unit.troops <= 0 || me.officer.status === "dead") {
      continue;
    }
    const enemies = enemiesOf(me);

    // 敗走中: 戦場から遠ざかる。追いすがられれば捕縛も
    if (me.unit.routed) {
      const nearest = enemies.sort((a, b) => chebyshev(a.unit, me.unit) - chebyshev(b.unit, me.unit))[0];
      if (nearest === undefined || chebyshev(nearest.unit, me.unit) >= FLEE_ESCAPE) {
        me.unit.gone = true;
        emitB("clash.flee", [me.officer.id], { x: me.unit.x, y: me.unit.y }, { officer: me.officer.id });
        escapeHome(world, me.officer);
        continue;
      }
      stepToward(me, me.unit.x + Math.sign(me.unit.x - nearest.unit.x) * 3, me.unit.y + Math.sign(me.unit.y - nearest.unit.y) * 3);
      stepToward(me, me.unit.x + Math.sign(me.unit.x - nearest.unit.x) * 3, me.unit.y + Math.sign(me.unit.y - nearest.unit.y) * 3);
      if (chebyshev(nearest.unit, me.unit) <= 1 && rng.chance(0.3)) {
        me.unit.gone = true;
        const capId = emitB("clash.capture", [me.officer.id], { x: me.unit.x, y: me.unit.y }, {
          victim: me.officer.id,
          captor: nearest.officer.id,
        });
        const captorFaction = world.factions.get(nearest.army.factionId);
        if (captorFaction !== undefined) {
          handleCaptive(world, me.officer.id, captorFaction, capId);
        }
      }
      continue;
    }

    if (enemies.length === 0) {
      // 攻城戦: 敵将が居なくても城そのものと戦う
      if (battle.siege && place !== undefined && me.army.target === place.id) {
        assaultCity(world, me, place, battle, names, emitB);
      }
      continue;
    }

    // 挑発されている: 理性を失い挑発者だけを追う
    let target: UnitRef | undefined;
    if (me.unit.tauntTicks > 0) {
      me.unit.tauntTicks -= 1;
      target = refs.find((r) => r.officer.id === me.unit.tauntTargetId && !r.unit.gone);
    }
    if (target === undefined) {
      target = enemies.reduce(
        (best, e) => (chebyshev(me.unit, e.unit) < chebyshev(me.unit, best.unit) ? e : best),
        enemies[0] as UnitRef,
      );
    }

    // 伏兵の発動: 隣へ来た敵に奇襲
    if (me.unit.hidden) {
      const prey = enemies.find((e) => chebyshev(me.unit, e.unit) <= 1);
      if (prey !== undefined) {
        me.unit.hidden = false;
        const aId = emitB("clash.ambush", [me.officer.id, prey.officer.id], { x: me.unit.x, y: me.unit.y }, {
          actor: me.officer.id,
          target: prey.officer.id,
        });
        damageUnit(prey, 0.22, 28);
        maybeRescue(prey, aId);
      }
      continue;
    }

    if (trySkill(me, target)) {
      continue;
    }

    if (chebyshev(me.unit, target.unit) <= 1) {
      melee(me, target);
    } else {
      stepToward(me, target.unit.x, target.unit.y);
      // 攻城中の寄せ手は、道すがら門を叩く
      if (battle.siege && place !== undefined && me.army.target === place.id && !place.gateBroken) {
        ramGate(world, me, place, battle, emitB);
      }
    }
  }

  // ---- 猛火の傍らでは兵が浮足立つ（火中でなくとも、煙と熱に士気を削られる） ----
  if (world.grid.fires.size > 0) {
    for (const me of refs) {
      if (me.unit.gone || me.unit.routed) {
        continue;
      }
      const onFire = world.grid.fires.has(world.grid.idx(me.unit.x, me.unit.y));
      if (onFire) {
        continue; // 火中の被害は延焼処理（stepFires）が別途課す。ここは近接の煙のみ
      }
      const nearFire = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ].some(([dx, dy]) => world.grid.fires.has(world.grid.idx(me.unit.x + (dx ?? 0), me.unit.y + (dy ?? 0))));
      if (nearFire) {
        me.unit.morale -= 3;
      }
    }
  }

  // ---- 士気と潰走 ----
  for (const me of refs) {
    if (me.unit.gone || me.unit.routed) {
      continue;
    }
    me.unit.morale += me.officer.aptitudes.leadership * 0.03;
    if (me.unit.morale <= 22 || me.unit.troops <= me.unit.troopsMax * 0.15) {
      me.unit.routed = true;
      me.unit.hidden = false;
      emitB("clash.rout", [me.officer.id], { x: me.unit.x, y: me.unit.y }, { officer: me.officer.id });
    }
  }

  // ---- 城壁の反撃（攻め手が城壁に取り付いている間、城兵が矢を浴びせる） ----
  if (battle.siege && place !== undefined && place.garrison > 50) {
    const walls = world.walls.get(place.id);
    if (walls !== undefined) {
      for (const me of refs) {
        if (me.unit.gone || me.army.target !== place.id) {
          continue;
        }
        const nearWall = walls.ring.some((wt) => chebyshev(me.unit, wt) <= 2) ||
          walls.gates.some((g) => chebyshev(me.unit, g) <= 2);
        if (nearWall) {
          damageUnit(me, 0.02 + place.defense * 0.0003, 3);
        }
      }
    }
  }

  // ---- 決着の判定 ----
  const still = unitRefsOf(world, battle).filter((r) => !r.unit.gone);
  const factionsAlive = [...new Set(still.map((r) => r.army.factionId))];
  const armiesIn = world.armies.filter((a) => a.battleId === battle.id);

  // 全滅した軍は解散する
  for (const army of armiesIn) {
    if (activeUnits(world, army).length === 0) {
      if (battle.siege && place !== undefined && army.target === place.id && army.goal !== "suppress") {
        emit(world, {
          kind: "war.repelled",
          loc: place.id,
          factions: battle.factions,
          causes: [battle.eventId],
        });
        const attackerFaction = world.factions.get(army.factionId);
        const ownerFaction = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
        if (attackerFaction !== undefined && ownerFaction !== undefined) {
          attackerFaction.feud.set(
            ownerFaction.id,
            Math.max(0, (attackerFaction.feud.get(ownerFaction.id) ?? 0) - 35),
          );
        }
      }
      disbandArmy(world, army);
    }
  }

  if (factionsAlive.length <= 1) {
    // 戦場に一色の旗だけが残った。勝者は行軍へ戻る
    for (const army of world.armies) {
      if (army.battleId !== battle.id) {
        continue;
      }
      delete army.battleId;
      if (battle.siege && place !== undefined && army.target === place.id) {
        // 守りが尽きた城は落ちる（門が立っていれば攻め続ける）
        const owner = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
        const attacker = world.factions.get(army.factionId);
        if (owner === undefined || owner.id === army.factionId) {
          army.state = "march";
          continue;
        }
        if (attacker !== undefined && (place.gateBroken || world.walls.get(place.id) === undefined) && place.garrison <= 120) {
          resolveCityFall(world, attacker, army, place, battle.eventId, names);
        } else {
          army.state = "fight";
          army.battleId = battle.id; // 攻城続行
        }
      } else if (army.target !== undefined && army.state === "fight") {
        army.state = "march";
        // 行軍を再開する（経路は次のstepArmiesで引き直す）
        army.path = [];
      }
    }
    const stillFighting = world.armies.some((a) => a.battleId === battle.id);
    if (!stillFighting) {
      world.battles = world.battles.filter((b) => b !== battle);
    }
  }
}

// 攻め手の一隊が城そのものへ攻めかかる（門を破り、城兵を削り、本丸へ至る）
function assaultCity(
  world: World,
  me: UnitRef,
  place: Place,
  battle: Battle,
  names: NameRegistry,
  emitB: (kind: string, actors: string[], at: XY, data: Record<string, unknown>, causes?: EventId[]) => EventId,
): void {
  const center = { x: place.gridX, y: place.gridY };
  const walls = world.walls.get(place.id);
  if (walls !== undefined && !place.gateBroken) {
    // 門へ寄せて叩く
    const gate = walls.gates.reduce(
      (best, g) => (chebyshev(me.unit, g) < chebyshev(me.unit, best) ? g : best),
      walls.gates[0] as XY,
    );
    if (chebyshev(me.unit, gate) > 1) {
      greedyStep(world, me, gate.x, gate.y);
      return;
    }
    ramGate(world, me, place, battle, emitB);
    return;
  }
  // 門は破れた（または裸の城）。本丸へ攻め入り、城兵と斬り結ぶ
  if (chebyshev(me.unit, center) > 1) {
    greedyStep(world, me, center.x, center.y);
  }
  if (chebyshev(me.unit, center) <= 1 && place.garrison > 0) {
    const power = me.unit.troops * 0.06 + me.officer.aptitudes.valor;
    place.garrison = Math.max(0, place.garrison - power);
    damageUnit(me, 0.015 + place.defense * 0.0002, 2);
  }
  const attacker = world.factions.get(me.army.factionId);
  const owner = place.owner !== undefined ? world.factions.get(place.owner) : undefined;
  if (
    attacker !== undefined &&
    owner !== undefined &&
    owner.id !== attacker.id &&
    place.garrison <= 60 &&
    chebyshev(me.unit, center) <= 1
  ) {
    resolveCityFall(world, attacker, me.army, place, battle.eventId, names);
  }
}

function ramGate(
  world: World,
  me: UnitRef,
  place: Place,
  battle: Battle,
  emitB: (kind: string, actors: string[], at: XY, data: Record<string, unknown>, causes?: EventId[]) => EventId,
): void {
  const walls = world.walls.get(place.id);
  if (walls === undefined || place.gateBroken) {
    return;
  }
  const gate = walls.gates.find((g) => chebyshev(me.unit, g) <= 1);
  if (gate === undefined) {
    return;
  }
  place.gateHp -= me.unit.troops * 0.04 + me.officer.aptitudes.valor;
  if (place.gateHp <= 0) {
    place.gateBroken = true;
    for (const g of walls.gates) {
      if (world.grid.at(g.x, g.y) === T.gate) {
        world.grid.set(g.x, g.y, T.burnt);
      }
    }
    place.defense = Math.max(5, place.defense - 6);
    emitB("war.gate-breach", [me.officer.id], gate, {});
  }
  void battle;
}

function greedyStep(world: World, me: UnitRef, tx: number, ty: number): void {
  const u = me.unit;
  const candidates = axisCandidates(u.x, u.y, tx, ty, world.rng);
  for (const c of candidates) {
    if ((c.x === u.x && c.y === u.y) || !world.grid.inBounds(c.x, c.y)) {
      continue;
    }
    if (!world.grid.passable(c.x, c.y) || isSealedGate(world, c.x, c.y, me.army.factionId)) {
      continue;
    }
    if (world.grid.fires.has(world.grid.idx(c.x, c.y))) {
      continue;
    }
    u.x = c.x;
    u.y = c.y;
    return;
  }
}

// 攻囲中の城の、まだ立っている最寄りの城門（火計の的になる）
function nearestSealedGate(world: World, place: Place | undefined, me: UnitRef): XY | undefined {
  if (place === undefined || place.gateBroken || me.army.target !== place.id) {
    return undefined;
  }
  if (place.owner === undefined || place.owner === me.army.factionId) {
    return undefined;
  }
  const walls = world.walls.get(place.id);
  if (walls === undefined) {
    return undefined;
  }
  const standing = walls.gates.filter((g) => world.grid.at(g.x, g.y) === T.gate);
  const gate = standing.sort((a, b) => chebyshev(me.unit, a) - chebyshev(me.unit, b))[0];
  return gate !== undefined && chebyshev(me.unit, gate) <= 4 ? gate : undefined;
}

// 閉ざされた他家の城門か（城門は主の兵しか通さない）
export function isSealedGate(world: World, x: number, y: number, factionId: string): boolean {
  if (world.grid.at(x, y) !== T.gate) {
    return false;
  }
  const placeId = world.cityTiles.get(world.grid.idx(x, y));
  if (placeId === undefined) {
    return false; // 関門は誰でも通れる
  }
  const place = world.places.get(placeId);
  return place !== undefined && place.owner !== undefined && place.owner !== factionId && !place.gateBroken;
}

// 敗走した将は近くの自領（無ければ生地）へ落ち延びる
export function escapeHome(world: World, officer: Officer): void {
  if (officer.status === "dead" || officer.status === "prisoner") {
    return;
  }
  const faction = officer.factionId !== undefined ? world.factions.get(officer.factionId) : undefined;
  const home = faction?.cities[0] ?? officer.homeLoc;
  officer.loc = home;
  officer.pos = placePos(world, home);
  delete officer.journey;
}

export function totalArmyTroops(world: World): number {
  return world.armies.reduce((sum, a) => sum + armyTroops(a), 0);
}

// 一日に縦横1マスだけ進む（斜め移動禁止・じっくり行軍）。地形が険しいほど1マスに数日を要する
export function moveArmyAlongPath(world: World, army: Army, speed: number): void {
  const prevX = army.x;
  const prevY = army.y;
  const result = stepOneTile(world.grid, army.x, army.y, army.mp, army.path, speed, (t, x, y) =>
    isSealedGate(world, x, y, army.factionId),
  );
  army.x = result.x;
  army.y = result.y;
  army.mp = result.mp;
  if (!result.moved) {
    return;
  }
  army.trail.push({ x: prevX, y: prevY });
  if (army.trail.length > 7) {
    army.trail.shift();
  }
  // 行軍中は各隊も隊列に従う
  for (const unit of army.units) {
    if (!unit.gone) {
      unit.x = army.x;
      unit.y = army.y;
    }
  }
}

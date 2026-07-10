// 責務: 戦闘エンジン。戦闘は「ダメージ計算」ではなく戦場と世界へ現象を発生させるイベント生成器である
// 技の規約: 全ての技は地形・持続物・敵AIのいずれかを必ず書き換える。兵の損耗は副産物にすぎない
import { emit } from "./events";
import type {
  BattleReplay,
  BattleReplayFrame,
  EventId,
  FactionId,
  Officer,
  Place,
  SkillId,
  World,
} from "./model";
import { nextId } from "./model";

export type Terrain =
  | "plain"
  | "forest"
  | "water"
  | "cliff"
  | "wall"
  | "gate"
  | "rubble"
  | "burnt"
  | "marsh"
  | "camp";

interface Cell {
  t: Terrain;
  fire: number; // 延焼の残りtick
}

interface Unit {
  officer: Officer;
  side: 0 | 1; // 0=寄せ手 1=守り手
  x: number;
  y: number;
  troops: number;
  troopsMax: number;
  morale: number;
  hidden: boolean;
  tauntTicks: number;
  tauntTargetId?: string;
  routed: boolean;
  gone: boolean; // 離脱・捕縛・戦死で盤面から消えた
  usedSkills: Set<SkillId>;
  glyph: string;
}

interface VolleyField {
  cells: Array<{ x: number; y: number }>;
  ticks: number;
  shooter: Unit;
  causeEvent: EventId;
}

export interface BattleSideInput {
  factionId: FactionId;
  officers: Officer[];
  troops: number;
}

export interface BattleInput {
  world: World;
  place: Place;
  attacker: BattleSideInput;
  defender: BattleSideInput;
  siege: boolean;
  causeEvent: EventId;
}

export interface BattleOutcome {
  attackerWon: boolean;
  dead: string[];
  captured: string[];
  attackerLoss: number;
  defenderLoss: number;
  burntCells: number;
  rubbleCells: number;
  gateBreached: boolean;
  battleEvent: EventId;
  replay: BattleReplay;
}

const W = 13;
const H = 13;
const MAX_TICKS = 32;
const GATE_X = 6;
const WALL_Y = 3;

const TERRAIN_GLYPH: Record<Terrain, string> = {
  plain: "・",
  forest: "木",
  water: "波",
  cliff: "山",
  wall: "壁",
  gate: "門",
  rubble: "瓦",
  burnt: "焦",
  marsh: "沼",
  camp: "営",
};

const ATTACKER_GLYPHS = ["Ａ", "Ｂ", "Ｃ", "Ｄ", "Ｅ", "Ｆ"];
const DEFENDER_GLYPHS = ["甲", "乙", "丙", "丁", "戊", "己"];

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < W && y >= 0 && y < H;
}

function flammable(t: Terrain): boolean {
  return t === "forest" || t === "plain" || t === "camp" || t === "gate";
}

function passable(t: Terrain, marshNative: boolean): boolean {
  if (t === "wall" || t === "cliff" || t === "rubble") {
    return false;
  }
  if (t === "water") {
    return marshNative;
  }
  if (t === "gate") {
    return false; // 破られるまで通れない（breach後はrubble/burntへ変わる）
  }
  return true;
}

export function runBattle(input: BattleInput): BattleOutcome {
  const { world, place, siege } = input;
  const rng = world.rng;

  const battleEvent = emit(world, {
    kind: "war.battle",
    loc: place.id,
    actors: [...input.attacker.officers, ...input.defender.officers].map((o) => o.id),
    factions: [input.attacker.factionId, input.defender.factionId],
    causes: [input.causeEvent],
  });

  // ---- 戦場生成（拠点の地勢から決定論的に敷く） ----
  const grid: Cell[][] = [];
  for (let y = 0; y < H; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < W; x += 1) {
      let t: Terrain = "plain";
      const roll = rng.next();
      if (roll < place.terrainForest) {
        t = "forest";
      } else if (roll < place.terrainForest + place.terrainWater) {
        t = place.kind === "marsh" ? "marsh" : "water";
      } else if (roll < place.terrainForest + place.terrainWater + place.terrainCliff) {
        t = "cliff";
      }
      row.push({ t, fire: 0 });
    }
    grid.push(row);
  }
  if (place.kind === "marsh") {
    // 水郷: 中央に水路が走る
    for (let y = 0; y < H; y += 1) {
      const channel = grid[y]?.[Math.floor(W / 2) + (y % 3) - 1];
      if (channel !== undefined && rng.chance(0.7)) {
        channel.t = "water";
      }
    }
  }
  let gateIntact = false;
  if (siege) {
    for (let x = 0; x < W; x += 1) {
      const cell = grid[WALL_Y]?.[x];
      if (cell !== undefined) {
        cell.t = x === GATE_X ? "gate" : "wall";
      }
    }
    for (let y = 0; y < WALL_Y; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const cell = grid[y]?.[x];
        if (cell !== undefined && cell.t !== "plain") {
          cell.t = "plain";
        }
      }
    }
    const keep = grid[0]?.[GATE_X];
    if (keep !== undefined) {
      keep.t = "camp";
    }
    gateIntact = true;
  }
  let gateHp = place.defense * 3;

  const cellAt = (x: number, y: number): Cell | undefined => grid[y]?.[x];

  // ---- 部隊配置 ----
  const units: Unit[] = [];
  const marshNativeSide = place.kind === "marsh" ? 1 : -1;

  const deploy = (side: 0 | 1, sideInput: BattleSideInput): void => {
    const officers = sideInput.officers.slice(0, 6);
    const per = Math.max(30, Math.floor(sideInput.troops / Math.max(1, officers.length)));
    officers.forEach((officer, i) => {
      const baseY = side === 0 ? H - 2 : siege ? 1 : 1;
      const x = Math.max(0, Math.min(W - 1, 2 + i * 2));
      const y = baseY + (i % 2 === 0 ? 0 : side === 0 ? 1 : 1);
      const unit: Unit = {
        officer,
        side,
        x,
        y: Math.max(0, Math.min(H - 1, y)),
        troops: per,
        troopsMax: per,
        morale: 70 + officer.aptitudes.leadership * 0.3,
        hidden: false,
        tauntTicks: 0,
        routed: false,
        gone: false,
        usedSkills: new Set(),
        glyph: (side === 0 ? ATTACKER_GLYPHS[i] : DEFENDER_GLYPHS[i]) ?? "?",
      };
      const cell = cellAt(unit.x, unit.y);
      if (cell !== undefined && !passable(cell.t, side === marshNativeSide)) {
        cell.t = "plain";
      }
      units.push(unit);
    });
  };
  deploy(0, input.attacker);
  deploy(1, input.defender);

  const volleys: VolleyField[] = [];
  const windDx = rng.pick([-1, 0, 1]);
  const windDy = rng.pick([-1, 0, 1]);
  const frames: BattleReplayFrame[] = [];
  const dead: string[] = [];
  const captured: string[] = [];
  let burntCells = 0;
  let rubbleCells = 0;
  let gateBreached = !siege;
  const respectedPairs = new Set<string>();

  const unitAt = (x: number, y: number): Unit | undefined =>
    units.find((u) => !u.gone && u.x === x && u.y === y);

  const enemiesOf = (u: Unit): Unit[] =>
    units.filter((e) => !e.gone && e.side !== u.side && !(e.hidden && dist(u, e) > 1));

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const tickEvents: EventId[] = [];
  const emitB = (
    kind: string,
    actors: string[],
    data: Record<string, unknown>,
    causes: EventId[] = [battleEvent.id],
  ): EventId => {
    const e = emit(world, {
      kind,
      loc: place.id,
      actors,
      factions: [input.attacker.factionId, input.defender.factionId],
      causes,
      data,
    });
    tickEvents.push(e.id);
    return e.id;
  };

  const damageUnit = (u: Unit, lossRatio: number, moraleHit: number): void => {
    const loss = Math.floor(u.troops * lossRatio);
    u.troops = Math.max(0, u.troops - loss);
    u.morale -= moraleHit + (loss / Math.max(1, u.troopsMax)) * 40;
    u.officer.hp = Math.max(0, u.officer.hp - Math.floor(lossRatio * 12));
  };

  const knockback = (attacker: Unit, target: Unit, dx: number, dy: number, causeId: EventId): void => {
    const steps = 2;
    let into: string = "ground";
    for (let s = 0; s < steps; s += 1) {
      const nx = target.x + Math.sign(dx);
      const ny = target.y + Math.sign(dy);
      if (!inBounds(nx, ny)) {
        break;
      }
      const cell = cellAt(nx, ny);
      if (cell === undefined) {
        break;
      }
      const blocker = unitAt(nx, ny);
      if (blocker !== undefined) {
        into = "unit";
        damageUnit(blocker, 0.06, 8);
        damageUnit(target, 0.06, 8);
        break;
      }
      if (cell.t === "wall" || cell.t === "cliff" || cell.t === "rubble" || (cell.t === "gate" && gateIntact)) {
        damageUnit(target, 0.05, 6);
        break;
      }
      if (cell.t === "water" && target.side !== marshNativeSide) {
        target.x = nx;
        target.y = ny;
        into = "water";
        break;
      }
      target.x = nx;
      target.y = ny;
      if (cell.fire > 0) {
        into = "fire";
        break;
      }
    }
    const kbId = emitB(
      "clash.knockback",
      [attacker.officer.id, target.officer.id],
      { attacker: attacker.officer.id, target: target.officer.id, into },
      [causeId],
    );
    if (into === "water") {
      damageUnit(target, 0.28, 30);
      emitB("clash.drown", [target.officer.id], { victim: target.officer.id }, [kbId]);
    } else if (into === "fire") {
      damageUnit(target, 0.18, 22);
      emitB(
        "clash.burn",
        [target.officer.id],
        { victim: target.officer.id, culprit: attacker.officer.id, victimSide: "enemy" },
        [kbId],
      );
    }
  };

  const igniteCell = (x: number, y: number, power: number): boolean => {
    const cell = cellAt(x, y);
    if (cell === undefined) {
      return false;
    }
    if (cell.t === "gate" && gateIntact) {
      gateHp -= power * 12;
      cell.fire = 3;
      return true;
    }
    if (!flammable(cell.t) || cell.fire > 0) {
      return false;
    }
    cell.fire = 2 + Math.floor(power);
    return true;
  };

  const breachGate = (causeId: EventId, how: "gate-breach" | "rubble"): void => {
    if (!gateIntact) {
      return;
    }
    gateIntact = false;
    gateBreached = true;
    const gate = cellAt(GATE_X, WALL_Y);
    if (gate !== undefined) {
      gate.t = how === "gate-breach" ? "burnt" : "rubble";
    }
    emitB("clash.terrain", [], { what: how }, [causeId]);
  };

  // ---- リプレイ描画 ----
  const renderFrame = (tick: number): void => {
    const rows: string[] = [];
    for (let y = 0; y < H; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) {
        const u = unitAt(x, y);
        const cell = cellAt(x, y);
        if (u !== undefined && !u.hidden) {
          row += u.glyph;
        } else if (cell !== undefined && cell.fire > 0) {
          row += "炎";
        } else {
          row += TERRAIN_GLYPH[cell?.t ?? "plain"];
        }
      }
      rows.push(row);
    }
    frames.push({ tick, grid: rows, notes: [...tickEvents] });
    tickEvents.length = 0;
  };

  // ---- 主ループ ----
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    // 1) 持続する矢の雨（外れ矢が第三者へ向かう）
    for (const volley of [...volleys]) {
      volley.ticks -= 1;
      for (const c of volley.cells) {
        const victim = unitAt(c.x, c.y);
        if (victim !== undefined && victim !== volley.shooter) {
          damageUnit(victim, 0.05, 6);
        }
        if (rng.chance(0.3)) {
          const sx = c.x + rng.pick([-1, 0, 1]);
          const sy = c.y + rng.pick([-1, 0, 1]);
          const strayVictim = unitAt(sx, sy);
          if (strayVictim !== undefined && strayVictim !== volley.shooter && !(sx === c.x && sy === c.y)) {
            damageUnit(strayVictim, 0.03, 4);
            strayVictim.officer.hp = Math.max(0, strayVictim.officer.hp - 4);
            emitB(
              "clash.stray",
              [volley.shooter.officer.id, strayVictim.officer.id],
              {
                culprit: volley.shooter.officer.id,
                victim: strayVictim.officer.id,
                victimSide: strayVictim.side === volley.shooter.side ? "ally" : "enemy",
              },
              [volley.causeEvent],
            );
          }
        }
      }
      if (volley.ticks <= 0) {
        volleys.splice(volleys.indexOf(volley), 1);
      }
    }

    // 2) 延焼（風向きに従い広がり、地形を焼き尽くす）
    const igniting: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const cell = cellAt(x, y);
        if (cell === undefined || cell.fire <= 0) {
          continue;
        }
        const victim = unitAt(x, y);
        if (victim !== undefined) {
          damageUnit(victim, 0.09, 12);
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nb = cellAt(x + dx, y + dy);
          if (nb === undefined || nb.fire > 0 || !flammable(nb.t)) {
            continue;
          }
          let p = nb.t === "forest" ? 0.4 : 0.12;
          if (dx === windDx && dy === windDy) {
            p += 0.25;
          }
          if (rng.chance(p)) {
            igniting.push({ x: x + dx, y: y + dy });
          }
        }
        cell.fire -= 1;
        if (cell.fire <= 0) {
          if (cell.t === "gate") {
            breachGate(battleEvent.id, "gate-breach");
          } else {
            cell.t = "burnt";
            burntCells += 1;
          }
        }
      }
    }
    for (const spot of igniting) {
      igniteCell(spot.x, spot.y, 1);
    }
    if (siege && gateIntact && gateHp <= 0) {
      breachGate(battleEvent.id, "gate-breach");
    }

    // 3) 部隊行動（武勇順。猪突の者は下知を待たない）
    const order = units
      .filter((u) => !u.gone)
      .sort((a, b) => b.officer.aptitudes.valor - a.officer.aptitudes.valor);

    for (const u of order) {
      if (u.gone || u.troops <= 0) {
        continue;
      }
      const enemies = enemiesOf(u);
      if (enemies.length === 0) {
        continue;
      }

      // 敗走中: 自陣の端へ逃げる。追いすがられれば捕縛も
      if (u.routed) {
        const edgeY = u.side === 0 ? H - 1 : 0;
        stepToward(u, u.x, edgeY);
        if (u.y === edgeY) {
          u.gone = true;
          continue;
        }
        const pursuer = enemies.find((e) => dist(e, u) <= 1);
        if (pursuer !== undefined && rng.chance(0.3)) {
          u.gone = true;
          captured.push(u.officer.id);
          emitB("clash.capture", [u.officer.id], {
            victim: u.officer.id,
            captor: pursuer.officer.id,
          });
        }
        continue;
      }

      // 挑発されている: 理性を失い挑発者だけを追う
      let target: Unit | undefined;
      if (u.tauntTicks > 0) {
        u.tauntTicks -= 1;
        target = units.find((t) => t.officer.id === u.tauntTargetId && !t.gone);
      }
      if (target === undefined) {
        target = enemies.reduce((best, e) => (dist(u, e) < dist(u, best) ? e : best), enemies[0] as Unit);
      }

      // 伏兵の発動: 隣へ来た敵に奇襲
      if (u.hidden) {
        const prey = enemies.find((e) => dist(u, e) <= 1);
        if (prey !== undefined) {
          u.hidden = false;
          const aId = emitB("clash.ambush", [u.officer.id, prey.officer.id], {
            actor: u.officer.id,
            target: prey.officer.id,
          });
          damageUnit(prey, 0.22, 28);
          maybeRescue(prey, aId);
        }
        continue;
      }

      // 技の選択（1戦闘に各技一度。世界へ現象を残すことが本義）
      if (tryUseSkill(u, target)) {
        continue;
      }

      // 白兵戦・接近
      if (dist(u, target) <= 1) {
        melee(u, target);
      } else {
        stepToward(u, target.x, target.y);
        if (siege && u.side === 0 && gateIntact && u.y === WALL_Y + 1 && Math.abs(u.x - GATE_X) <= 1) {
          gateHp -= u.troops * 0.04 + u.officer.aptitudes.valor;
        }
      }
    }

    // 4) 士気崩壊の判定
    for (const u of units) {
      if (u.gone || u.routed) {
        continue;
      }
      u.morale += u.officer.aptitudes.leadership * 0.03;
      if (u.morale <= 22 || u.troops <= u.troopsMax * 0.15) {
        u.routed = true;
        u.hidden = false;
        emitB("clash.rout", [u.officer.id], { officer: u.officer.id });
      }
    }

    renderFrame(tick);

    const attackersLeft = units.some((u) => !u.gone && u.side === 0 && !u.routed);
    const defendersLeft = units.some((u) => !u.gone && u.side === 1 && !u.routed);
    if (!attackersLeft || !defendersLeft) {
      break;
    }
  }

  // ---- 集計 ----
  const attackerLoss = units
    .filter((u) => u.side === 0)
    .reduce((sum, u) => sum + (u.troopsMax - u.troops), 0);
  const defenderLoss = units
    .filter((u) => u.side === 1)
    .reduce((sum, u) => sum + (u.troopsMax - u.troops), 0);
  const attackersLeft = units.some((u) => !u.gone && u.side === 0 && !u.routed);
  const defendersLeft = units.some((u) => !u.gone && u.side === 1 && !u.routed);
  const attackerWon = attackersLeft && !defendersLeft;

  const replay: BattleReplay = {
    id: nextId(world, "b"),
    tick: world.tick,
    loc: place.id,
    attackerFaction: input.attacker.factionId,
    defenderFaction: input.defender.factionId,
    frames,
    eventIds: [battleEvent.id],
  };
  world.replays.push(replay);

  return {
    attackerWon,
    dead,
    captured,
    attackerLoss,
    defenderLoss,
    burntCells,
    rubbleCells,
    gateBreached,
    battleEvent: battleEvent.id,
    replay,
  };

  // ---- 内部関数 ----
  function stepToward(u: Unit, tx: number, ty: number): void {
    const candidates = [
      { x: u.x + Math.sign(tx - u.x), y: u.y + Math.sign(ty - u.y) },
      { x: u.x + Math.sign(tx - u.x), y: u.y },
      { x: u.x, y: u.y + Math.sign(ty - u.y) },
      { x: u.x + rng.pick([-1, 1]), y: u.y },
      { x: u.x, y: u.y + rng.pick([-1, 1]) },
    ];
    for (const c of candidates) {
      if (!inBounds(c.x, c.y) || (c.x === u.x && c.y === u.y)) {
        continue;
      }
      const cell = cellAt(c.x, c.y);
      if (cell === undefined || cell.fire > 0) {
        continue;
      }
      if (!passable(cell.t, u.side === marshNativeSide)) {
        continue;
      }
      if (unitAt(c.x, c.y) !== undefined) {
        continue;
      }
      u.x = c.x;
      u.y = c.y;
      return;
    }
  }

  function melee(u: Unit, target: Unit): void {
    // 一騎討ちの気風: 誇り高き猛将同士は隊をおいて立ち合う
    const pairKey = [u.officer.id, target.officer.id].sort().join(":");
    if (
      u.officer.aptitudes.valor >= 70 &&
      target.officer.aptitudes.valor >= 70 &&
      !respectedPairs.has(pairKey) &&
      rng.chance(0.3)
    ) {
      respectedPairs.add(pairKey);
      duel(u, target);
      return;
    }
    const terrainGuard = cellAt(target.x, target.y)?.t === "forest" ? 0.75 : 1;
    const ratio = (0.05 + u.officer.aptitudes.valor * 0.0007) * terrainGuard * (u.tauntTicks > 0 ? 1.2 : 1);
    damageUnit(target, ratio, 6);
    damageUnit(u, ratio * 0.45, 3);
    maybeRescue(target, battleEvent.id);
    if (target.troops <= 0 && !target.gone) {
      target.gone = true;
      if (rng.chance(0.35)) {
        dead.push(target.officer.id);
        emitB("clash.fall", [target.officer.id], {
          victim: target.officer.id,
          killer: u.officer.id,
        });
      } else {
        captured.push(target.officer.id);
        emitB("clash.capture", [target.officer.id], {
          victim: target.officer.id,
          captor: u.officer.id,
        });
      }
    }
  }

  function duel(a: Unit, b: Unit): void {
    const rollA = a.officer.aptitudes.valor + rng.next() * 35;
    const rollB = b.officer.aptitudes.valor + rng.next() * 35;
    const rounds = 10 + rng.int(40);
    if (Math.abs(rollA - rollB) < 7) {
      emitB("clash.duel-respect", [a.officer.id, b.officer.id], {});
      return;
    }
    const winner = rollA > rollB ? a : b;
    const loser = rollA > rollB ? b : a;
    const fatal = rng.chance(0.15);
    const dId = emitB("clash.duel", [winner.officer.id, loser.officer.id], {
      winner: winner.officer.id,
      loser: loser.officer.id,
      rounds,
      fatal,
    });
    winner.officer.fameOutlaw += winner.side === 0 && input.attacker.factionId === "court" ? 0 : 4;
    winner.officer.fameOfficial += 4;
    if (fatal) {
      loser.gone = true;
      loser.officer.hp = 0;
      dead.push(loser.officer.id);
      emitB("clash.fall", [loser.officer.id], { victim: loser.officer.id, killer: winner.officer.id }, [dId]);
    } else {
      loser.officer.hp = Math.max(1, loser.officer.hp - 35);
      loser.morale -= 25;
      damageUnit(loser, 0.08, 10);
    }
  }

  function maybeRescue(target: Unit, causeId: EventId): void {
    if (target.troops > target.troopsMax * 0.2 && target.officer.hp > 15) {
      return;
    }
    const savior = units.find(
      (u) => !u.gone && !u.routed && u.side === target.side && u !== target && dist(u, target) <= 2,
    );
    if (savior !== undefined && rng.chance(0.5)) {
      target.morale += 15;
      target.troops += Math.floor(savior.troops * 0.1);
      savior.troops = Math.floor(savior.troops * 0.9);
      emitB(
        "clash.rescue",
        [savior.officer.id, target.officer.id],
        { savior: savior.officer.id, saved: target.officer.id },
        [causeId],
      );
    }
  }

  function tryUseSkill(u: Unit, target: Unit): boolean {
    const d = dist(u, target);
    for (const skill of u.officer.skills) {
      if (u.usedSkills.has(skill)) {
        continue;
      }
      switch (skill) {
        case "taunt": {
          if (
            d <= 5 &&
            target.officer.values.aggression >= 60 &&
            !target.routed &&
            rng.chance(0.55)
          ) {
            u.usedSkills.add(skill);
            const resist = target.officer.values.caution + rng.next() * 40;
            const push = u.officer.aptitudes.intellect * 0.5 + u.officer.values.face * 0.3 + rng.next() * 40;
            if (push > resist) {
              target.tauntTicks = 4;
              target.tauntTargetId = u.officer.id;
              emitB("clash.taunt", [u.officer.id, target.officer.id], {
                taunter: u.officer.id,
                target: target.officer.id,
              });
              return true;
            }
          }
          break;
        }
        case "volley": {
          if (d >= 2 && d <= 5 && rng.chance(0.6)) {
            u.usedSkills.add(skill);
            const vId = emitB("clash.volley", [u.officer.id], { shooter: u.officer.id });
            const cells = [
              { x: target.x, y: target.y },
              { x: target.x + 1, y: target.y },
              { x: target.x - 1, y: target.y },
            ].filter((c) => inBounds(c.x, c.y));
            volleys.push({ cells, ticks: 2, shooter: u, causeEvent: vId });
            return true;
          }
          break;
        }
        case "fire": {
          const targetCell = cellAt(target.x, target.y);
          const nearGate = siege && gateIntact && u.side === 0 && Math.abs(u.x - GATE_X) <= 3;
          if (
            d <= 4 &&
            rng.chance(0.5) &&
            (nearGate || (targetCell !== undefined && flammable(targetCell.t)))
          ) {
            u.usedSkills.add(skill);
            const power = 1 + u.officer.aptitudes.intellect / 50;
            if (nearGate) {
              igniteCell(GATE_X, WALL_Y, power);
            } else {
              igniteCell(target.x, target.y, power);
              igniteCell(target.x + windDx, target.y + windDy, power);
            }
            emitB("clash.fire", [u.officer.id], { arsonist: u.officer.id });
            return true;
          }
          break;
        }
        case "sorcery": {
          const cluster = enemiesOf(u).filter((e) => dist(e, target) <= 1);
          if (d <= 5 && cluster.length >= 2 && rng.chance(0.5)) {
            u.usedSkills.add(skill);
            const sId = emitB("clash.sorcery", [u.officer.id], {
              caster: u.officer.id,
              mode: "storm",
            });
            for (const e of cluster) {
              damageUnit(e, 0.12, 18);
              const nx = e.x + rng.pick([-1, 0, 1]);
              const ny = e.y + rng.pick([-1, 0, 1]);
              const cell = cellAt(nx, ny);
              if (
                cell !== undefined &&
                passable(cell.t, e.side === marshNativeSide) &&
                unitAt(nx, ny) === undefined
              ) {
                e.x = nx;
                e.y = ny;
              }
              maybeRescue(e, sId);
            }
            return true;
          }
          break;
        }
        case "rockfall": {
          const nearCliff = [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
          ].some(([dx, dy]) => cellAt(target.x + (dx ?? 0), target.y + (dy ?? 0))?.t === "cliff");
          if (d <= 4 && nearCliff && rng.chance(0.6)) {
            u.usedSkills.add(skill);
            const rId = emitB("clash.rockfall", [u.officer.id, target.officer.id], {
              actor: u.officer.id,
            });
            damageUnit(target, 0.25, 25);
            const cell = cellAt(target.x, target.y + 1);
            if (cell !== undefined && cell.t !== "wall") {
              cell.t = "rubble";
              rubbleCells += 1;
              emitB("clash.terrain", [], { what: "rubble" }, [rId]);
            }
            maybeRescue(target, rId);
            return true;
          }
          break;
        }
        case "ambush": {
          const myCell = cellAt(u.x, u.y);
          if (
            myCell?.t === "forest" &&
            d > 2 &&
            !u.hidden &&
            rng.chance(0.5) &&
            u.usedSkills.size === 0
          ) {
            u.usedSkills.add(skill);
            u.hidden = true;
            return true;
          }
          break;
        }
        case "charge": {
          if (d >= 1 && d <= 3 && rng.chance(0.55)) {
            u.usedSkills.add(skill);
            const dx = target.x - u.x;
            const dy = target.y - u.y;
            // 突進位置まで駆ける（歩数上限つき）
            for (let dash = 0; dash < 4 && dist(u, target) > 1; dash += 1) {
              const beforeX = u.x;
              const beforeY = u.y;
              stepToward(u, target.x, target.y);
              if (u.x === beforeX && u.y === beforeY) {
                break;
              }
            }
            if (dist(u, target) <= 1) {
              const cId = emitB("clash.charge", [u.officer.id, target.officer.id], {
                attacker: u.officer.id,
                target: target.officer.id,
              });
              damageUnit(target, 0.14 + u.officer.aptitudes.valor * 0.001, 16);
              knockback(u, target, dx, dy, cId);
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
  }
}

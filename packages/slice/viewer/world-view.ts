// 責務: 世界俯瞰の実体描画。拠点・武将・軍勢・護送・交戦・火災・矢・亡骸を実シミュレーション状態から毎日更新する
// 軍勢はタイルを一歩ずつ、等速かつイージング無しでじっくりと進み、交戦中は各隊が世界地図の上に散開する
// 戦争画面は無い——世界そのものが戦場である。アイコンは常にタイルの中心に置く
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { NameRegistry, World } from "../src/model";
import { armyTroops, placePos } from "../src/model";
import { computeTerritory } from "./territory";
import { CELL, FONT_JP, decoRand, factionColor } from "./theme";

interface Pulse {
  g: Graphics;
  x: number;
  y: number;
  color: number;
  t: number;
  dur: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  t: number;
  dur: number;
}

interface FloatText {
  t: Text;
  vy: number;
  age: number;
  dur: number;
}

// 等速・イージング無しの直線移動: fromから始まりdur[ms]かけてtoへ着く。斜めに見えても実体は縦横1マスずつ歩む
interface MoveState {
  root: Container;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  fading?: boolean;
}

interface OfficerSprite extends MoveState {
  dot: Graphics;
  label: Text;
}

export type SelectHandler = (kind: "officer" | "place" | "army", id: string) => void;

// タイル座標(x,y)の中心を画面ピクセルへ
function tileCenter(x: number, y: number): { x: number; y: number } {
  return { x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 };
}

// 「1マス進む→一瞬停止→周囲を確認→次の一歩」のテンポ。1日の実時間のうち歩みに使うのは一部だけで、
// 残りは静止する——滑らかな等速Tweenではなく、考えながら進軍している間として見える
const MOVE_PORTION = 0.5;

function retarget(s: MoveState, nx: number, ny: number, dur: number): void {
  if (s.toX === nx && s.toY === ny) {
    return; // 目的地が変わらないなら動かさない（足踏み中）
  }
  s.fromX = s.root.x;
  s.fromY = s.root.y;
  s.toX = nx;
  s.toY = ny;
  s.t = 0;
  s.dur = Math.max(1, dur * MOVE_PORTION);
}

// 一隊を単一の点ではなく、小さな兵の集まりとして描く（軍隊らしさ・戦線らしさのための隊列表現）
function drawFormation(g: Graphics, seedKey: string, color: number, troops: number): void {
  const count = Math.max(3, Math.min(8, Math.round(troops / 130) + 2));
  for (let i = 0; i < count; i += 1) {
    const angle = decoRand(seedKey, i * 2) * Math.PI * 2;
    const radius = 1.6 + decoRand(seedKey, i * 2 + 1) * 3.4;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius * 0.75;
    const size = 1.1 + decoRand(seedKey, i + 40) * 0.7;
    g.circle(dx, dy, size).fill(color).stroke({ width: 0.6, color: 0x0d0a07 });
  }
  g.circle(0, 0, 0.9).fill(0xffe9c0); // 将旗（隊の中心。指揮官の位置）
}

// 行軍中の軍勢を「一人の武将」ではなく「密集した部隊」に見せる——隊列のブロックに旌旗を立てる
function drawArmyBlock(g: Graphics, color: number, troops: number): void {
  g.clear();
  const w = 20;
  const h = 13;
  g.roundRect(-w / 2, -h, w, h, 2).fill({ color: 0x211c14, alpha: 0.92 }).stroke({ width: 1.8, color });
  // 兵の密度を示す横列（多いほど列が増え、密集して見える）
  const ranks = Math.max(2, Math.min(4, 1 + Math.round(troops / 700)));
  for (let r = 0; r < ranks; r += 1) {
    const ry = -h + 3 + (r * (h - 6)) / Math.max(1, ranks - 1);
    g.moveTo(-w / 2 + 3, ry).lineTo(w / 2 - 3, ry).stroke({ width: 1.2, color, alpha: 0.6 });
  }
  // 旗竿と旌旗
  g.moveTo(0, -h).lineTo(0, -h - 11).stroke({ width: 1.8, color: 0xd8d2c0 });
  g.poly([0, -h - 11, 11, -h - 8, 0, -h - 5]).fill(color).stroke({ width: 1, color: 0x000000 });
}

function snapTo(s: MoveState, x: number, y: number): void {
  s.root.x = x;
  s.root.y = y;
  s.fromX = x;
  s.fromY = y;
  s.toX = x;
  s.toY = y;
  s.t = 1;
  s.dur = 1;
}

export class WorldView {
  readonly root = new Container();
  private readonly territoryLayer = new Container(); // 勢力の支配領域（色分けタイント）
  private readonly territorySprite: Sprite;
  private readonly territoryCanvas: HTMLCanvasElement;
  private readonly relationG = new Graphics(); // 勢力間の敵対関係線
  private readonly factionLabelLayer = new Container();
  private readonly factionLabels = new Map<string, Text>();
  private readonly trailG = new Graphics(); // 行軍の足跡と進軍矢線
  private readonly corpseG = new Graphics(); // 世界に残る亡骸
  private readonly siegeG = new Graphics(); // 攻囲される都市を囲う輪
  private readonly placeLayer = new Container();
  private readonly armyLayer = new Container();
  private readonly officerLayer = new Container();
  private readonly battleLayer = new Container();
  private readonly liveFx = new Graphics(); // 毎フレーム描き直す現象（炎・矢）
  private readonly fxLayer = new Container();

  private readonly placeMarks = new Map<string, Container>();
  private readonly placeBodies = new Map<string, Graphics>();
  private readonly placeInfos = new Map<string, Text>();
  private readonly placeLabels = new Map<string, Text>();
  private readonly officerSprites = new Map<string, OfficerSprite>();
  private readonly armySprites = new Map<string, MoveState & { label: Text; flag: Graphics }>();
  private readonly unitSprites = new Map<string, OfficerSprite>();
  private readonly convoySprites = new Map<string, MoveState>();
  private readonly battleMarks = new Map<string, Container>();

  private pulses: Pulse[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private zoomNow = 1;
  private flicker = 0;
  private smokeBudget = 0;

  onSelect: SelectHandler = () => undefined;

  constructor(
    private readonly world: World,
    private readonly names: NameRegistry,
  ) {
    this.territoryCanvas = document.createElement("canvas");
    this.territoryCanvas.width = world.grid.w;
    this.territoryCanvas.height = world.grid.h;
    this.territorySprite = new Sprite(Texture.from(this.territoryCanvas));
    this.territorySprite.scale.set(CELL);
    this.territoryLayer.addChild(this.territorySprite);
    this.root.addChild(this.territoryLayer);
    this.root.addChild(this.relationG);
    this.root.addChild(this.factionLabelLayer);
    this.root.addChild(this.trailG);
    this.root.addChild(this.siegeG);
    this.root.addChild(this.corpseG);
    this.root.addChild(this.placeLayer);
    this.root.addChild(this.armyLayer);
    this.root.addChild(this.officerLayer);
    this.root.addChild(this.battleLayer);
    this.root.addChild(this.liveFx);
    this.root.addChild(this.fxLayer);
    this.buildPlaces();
    this.refreshTerritory();
    this.applyTick(0);
  }

  pos(placeId: string): { x: number; y: number } {
    const p = placePos(this.world, placeId);
    return tileCenter(p.x, p.y);
  }

  // 武将ごとに拠点内の定位置（決定論的な散らし）を持つ
  private officerOffset(officerId: string): { x: number; y: number } {
    const angle = decoRand(officerId, 1) * Math.PI * 2;
    const radius = 9 + decoRand(officerId, 2) * 9;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 };
  }

  private buildPlaces(): void {
    for (const place of this.world.places.values()) {
      const c = new Container();
      const center = tileCenter(place.gridX, place.gridY);
      c.x = center.x;
      c.y = center.y;
      const body = new Graphics();
      c.addChild(body);
      const isMinor = place.kind === "pass" || place.kind === "port" || place.kind === "town";
      const label = new Text({
        text: this.names.place(place.id),
        style: {
          fontFamily: FONT_JP,
          fontSize: isMinor ? 9 : place.kind === "capital" ? 13 : 11,
          fill: isMinor ? 0xbfb49a : 0xf0e6d2,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5, 0);
      label.y = place.kind === "capital" ? 20 : 10;
      c.addChild(label);
      const info = new Text({
        text: "",
        style: { fontFamily: FONT_JP, fontSize: 8, fill: 0xbfae90, stroke: { color: 0x000000, width: 2 } },
      });
      info.anchor.set(0.5, 0);
      info.y = (place.kind === "capital" ? 20 : 10) + 12;
      c.addChild(info);
      c.eventMode = "static";
      c.cursor = "pointer";
      c.on("pointertap", () => this.onSelect("place", place.id));
      this.placeLayer.addChild(c);
      this.placeMarks.set(place.id, c);
      this.placeBodies.set(place.id, body);
      this.placeInfos.set(place.id, info);
      this.placeLabels.set(place.id, label);
    }
  }

  private redrawPlace(placeId: string): void {
    const place = this.world.places.get(placeId);
    const body = this.placeBodies.get(placeId);
    const info = this.placeInfos.get(placeId);
    if (place === undefined || body === undefined || info === undefined) {
      return;
    }
    const color = factionColor(place.owner);
    body.clear();
    switch (place.kind) {
      case "capital":
      case "county":
      case "manor":
      case "town": {
        const s = place.kind === "capital" ? 9 : place.kind === "town" ? 4.5 : 6.5;
        body.rect(-s, -s * 0.8, s * 2, s * 1.6).fill({ color: 0x2a241c }).stroke({ width: 1.6, color });
        if (place.kind !== "town") {
          body.rect(-s * 0.4, -s * 1.3, s * 0.8, s * 0.6).fill({ color: 0x2a241c }).stroke({ width: 1.4, color });
        }
        body.moveTo(s * 0.85, -s * 0.8).lineTo(s * 0.85, -s * 2.1).stroke({ width: 1.4, color: 0x888888 });
        body.poly([s * 0.85, -s * 2.1, s * 2.2, -s * 1.8, s * 0.85, -s * 1.5]).fill(color);
        break;
      }
      case "lairsite":
      case "marsh": {
        body.poly([-6, 4, 0, -7, 6, 4]).fill({ color: 0x33291f }).stroke({ width: 1.4, color });
        if (place.owner !== undefined) {
          body.moveTo(0, -7).lineTo(0, -15).stroke({ width: 1.4, color: 0x888888 });
          body.poly([0, -15, 8, -13, 0, -10]).fill(color);
        }
        break;
      }
      case "pass": {
        body.rect(-5, -4, 2, 8).fill(0x8a7a5e);
        body.rect(3, -4, 2, 8).fill(0x8a7a5e);
        body.rect(-6, -6, 12, 2.5).fill(0x8a7a5e);
        break;
      }
      case "port": {
        body.circle(0, -3, 2).stroke({ width: 1.4, color: 0x9ec4d8 });
        body.moveTo(0, -1).lineTo(0, 5).stroke({ width: 1.4, color: 0x9ec4d8 });
        body.moveTo(-4, 2).lineTo(0, 5).lineTo(4, 2).stroke({ width: 1.4, color: 0x9ec4d8 });
        break;
      }
      default:
        break;
    }
    if (place.devastation > 0) {
      body.circle(0, -2, 10).fill({ color: 0x000000, alpha: Math.min(0.5, place.devastation / 160) });
    }
    const bits: string[] = [];
    if (place.garrison >= 50) {
      bits.push(`兵${Math.floor(place.garrison)}`);
    }
    if (place.devastation >= 10) {
      bits.push(`禍${Math.floor(place.devastation)}`);
    }
    if (place.gateBroken) {
      bits.push("門破");
    }
    info.text = bits.join(" ");
  }

  // ---- 日次更新: 実体の目標位置を差し替える。dayMsは今の1日の実時間の長さ（等速アニメの基準） ----
  applyTick(dayMs: number): void {
    for (const placeId of this.world.places.keys()) {
      this.redrawPlace(placeId);
    }
    this.updateOfficers(dayMs);
    this.updateArmies(dayMs);
    this.updateConvoys(dayMs);
    this.updateBattles();
    this.redrawCorpses();
  }

  entityPosition(kind: "officer" | "place" | "army" | "battle", id: string): { x: number; y: number } | undefined {
    if (kind === "place") {
      return this.pos(id);
    }
    if (kind === "officer") {
      const s = this.officerSprites.get(id);
      return s !== undefined ? { x: s.root.x, y: s.root.y } : undefined;
    }
    if (kind === "battle") {
      const battle = this.world.battles.find((b) => b.id === id);
      return battle !== undefined ? tileCenter(battle.x, battle.y) : undefined;
    }
    const s = this.armySprites.get(id);
    return s !== undefined ? { x: s.root.x, y: s.root.y } : undefined;
  }

  private updateOfficers(dayMs: number): void {
    const inArmies = new Set(this.world.armies.flatMap((a) => a.units.map((u) => u.officerId)));
    for (const officer of this.world.officers.values()) {
      let sprite = this.officerSprites.get(officer.id);
      if (officer.status === "dead") {
        if (sprite !== undefined && !sprite.fading) {
          sprite.fading = true;
        }
        continue;
      }
      const traveling = officer.journey !== undefined;
      const off = traveling ? { x: 0, y: 0 } : this.officerOffset(officer.id);
      const center = tileCenter(officer.pos.x, officer.pos.y);
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (sprite === undefined) {
        const root = new Container();
        const dot = new Graphics();
        root.addChild(dot);
        const label = new Text({
          text: this.names.officerShort(officer.id),
          style: { fontFamily: FONT_JP, fontSize: 8, fill: 0xd8d2c0, stroke: { color: 0x000000, width: 2 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 3.5;
        label.alpha = 0.92;
        root.addChild(label);
        root.eventMode = "static";
        root.cursor = "pointer";
        root.on("pointertap", () => this.onSelect("officer", officer.id));
        this.officerLayer.addChild(root);
        sprite = { root, dot, label, fromX: tx, fromY: ty, toX: tx, toY: ty, t: 1, dur: 1 };
        snapTo(sprite, tx, ty);
        this.officerSprites.set(officer.id, sprite);
      } else {
        retarget(sprite, tx, ty, dayMs);
      }
      // 軍に編入中は隊で表現するため個人の点は消す
      sprite.root.visible = !inArmies.has(officer.id);
      sprite.dot.clear();
      const tint = officer.status === "prisoner" ? 0x5a4a4a : factionColor(officer.factionId);
      if (officer.status === "roaming" || officer.status === "free") {
        sprite.dot.circle(0, 0, 3).fill({ color: 0x14110c }).stroke({ width: 1.4, color: tint });
      } else {
        sprite.dot.circle(0, 0, 3).fill(tint).stroke({ width: 1, color: 0x14110c });
      }
      if (officer.status === "prisoner") {
        sprite.dot.circle(0, 0, 4.6).stroke({ width: 1, color: 0x993333 });
      }
    }
  }

  private updateArmies(dayMs: number): void {
    const seenArmies = new Set<string>();
    const seenUnits = new Set<string>();
    this.trailG.clear();

    for (const army of this.world.armies) {
      seenArmies.add(army.id);
      const color = factionColor(army.factionId);
      const fighting = army.battleId !== undefined || army.state === "fight";
      const armyCenter = tileCenter(army.x, army.y);

      // 行軍の足跡（兵列）と進軍先の矢線
      if (!fighting) {
        // 補給線: 辿ってきた道を勢力色の帯で繋ぐ（兵站が伸びている様子）
        if (army.trail.length > 0) {
          this.trailG.moveTo(armyCenter.x, armyCenter.y);
          for (let i = army.trail.length - 1; i >= 0; i -= 1) {
            const step = army.trail[i];
            if (step === undefined) {
              continue;
            }
            const sc = tileCenter(step.x, step.y);
            this.trailG.lineTo(sc.x, sc.y);
          }
          this.trailG.stroke({ width: 2.2, color, alpha: 0.28 });
        }
        for (let i = 0; i < army.trail.length; i += 1) {
          const step = army.trail[i];
          if (step === undefined) {
            continue;
          }
          const sc = tileCenter(step.x, step.y);
          this.trailG
            .circle(sc.x + (i % 2) * 2 - 1, sc.y + ((i + 1) % 2) * 2 - 1, 1.5)
            .fill({ color: 0xd8d2c0, alpha: 0.25 + (i / army.trail.length) * 0.55 });
        }
        // 進軍先への矢線は破線気味に（未だ踏んでいない道と分かるよう帯より細く）
        const to = this.pos(army.target);
        this.trailG
          .moveTo(armyCenter.x, armyCenter.y)
          .lineTo(to.x, to.y)
          .stroke({ width: 1.2, color, alpha: 0.32 });
        this.trailG.circle(to.x, to.y, 6).stroke({ width: 1.8, color, alpha: 0.55 });
      }

      // 軍勢の塊（行軍時のみ。交戦時は各隊が主役）。「一人の武将」ではなく「部隊」と分かる見た目にする
      let sprite = this.armySprites.get(army.id);
      const flagTx = armyCenter.x;
      const flagTy = armyCenter.y - 8;
      if (sprite === undefined) {
        const root = new Container();
        const flag = new Graphics();
        root.addChild(flag);
        const label = new Text({
          text: "",
          style: { fontFamily: FONT_JP, fontSize: 9, fill: 0xffe9c0, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 6;
        root.addChild(label);
        root.eventMode = "static";
        root.cursor = "pointer";
        const armyId = army.id;
        root.on("pointertap", () => this.onSelect("army", armyId));
        this.armyLayer.addChild(root);
        sprite = { root, label, flag, fromX: flagTx, fromY: flagTy, toX: flagTx, toY: flagTy, t: 1, dur: 1 };
        snapTo(sprite, flagTx, flagTy);
        this.armySprites.set(army.id, sprite);
      } else {
        retarget(sprite, flagTx, flagTy, dayMs);
      }
      drawArmyBlock(sprite.flag, color, armyTroops(army));
      sprite.root.visible = !fighting;
      sprite.label.text = `${this.names.faction(army.factionId)}軍 ${armyTroops(army)}`;

      // 交戦中: 各隊が世界タイル上に散開する
      if (fighting) {
        for (const unit of army.units) {
          if (unit.gone) {
            continue;
          }
          const key = `${army.id}:${unit.officerId}`;
          seenUnits.add(key);
          const uc = tileCenter(unit.x, unit.y);
          let us = this.unitSprites.get(key);
          if (us === undefined) {
            const root = new Container();
            const dot = new Graphics();
            root.addChild(dot);
            const label = new Text({
              text: this.names.officerShort(unit.officerId),
              style: { fontFamily: FONT_JP, fontSize: 7.5, fill: 0xffe0c0, stroke: { color: 0x000000, width: 2 } },
            });
            label.anchor.set(0.5, 0);
            label.y = 4.5;
            root.addChild(label);
            root.eventMode = "static";
            root.cursor = "pointer";
            const oid = unit.officerId;
            root.on("pointertap", () => this.onSelect("officer", oid));
            this.armyLayer.addChild(root);
            us = { root, dot, label, fromX: uc.x, fromY: uc.y, toX: uc.x, toY: uc.y, t: 1, dur: 1 };
            snapTo(us, uc.x, uc.y);
            this.unitSprites.set(key, us);
          } else {
            // 戦闘中の動きは一日の中の複数所作の結果なので、日の長さぶんで滑らかに追いつく
            retarget(us, uc.x, uc.y, dayMs);
          }
          us.dot.clear();
          if (unit.hidden) {
            us.dot.circle(0, 0, 3.6).stroke({ width: 1, color, alpha: 0.35 });
            us.label.alpha = 0.3;
          } else {
            drawFormation(us.dot, key, color, unit.troops);
            if (unit.routed) {
              us.dot.moveTo(-4, -4).lineTo(4, 4).stroke({ width: 1.4, color: 0x000000, alpha: 0.7 });
            }
            us.label.alpha = 0.95;
          }
        }
      }
    }

    for (const [id, sprite] of this.armySprites) {
      if (!seenArmies.has(id)) {
        sprite.root.destroy();
        this.armySprites.delete(id);
      }
    }
    for (const [key, sprite] of this.unitSprites) {
      if (!seenUnits.has(key)) {
        sprite.root.destroy();
        this.unitSprites.delete(key);
      }
    }
  }

  private updateConvoys(dayMs: number): void {
    const seen = new Set<string>();
    for (const convoy of this.world.convoys) {
      seen.add(convoy.prisoner);
      const center = tileCenter(convoy.x, convoy.y);
      let sprite = this.convoySprites.get(convoy.prisoner);
      if (sprite === undefined) {
        const root = new Container();
        const g = new Graphics();
        g.rect(-4.5, -3, 9, 5).fill({ color: 0x3d3428 }).stroke({ width: 1.4, color: 0x993333 });
        g.circle(-3, 3, 1.8).fill(0x222222);
        g.circle(3, 3, 1.8).fill(0x222222);
        root.addChild(g);
        const label = new Text({
          text: `護送 ${this.names.officerShort(convoy.prisoner)}`,
          style: { fontFamily: FONT_JP, fontSize: 8, fill: 0xdd9999, stroke: { color: 0x000000, width: 2 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 5;
        root.addChild(label);
        this.armyLayer.addChild(root);
        sprite = { root, fromX: center.x, fromY: center.y, toX: center.x, toY: center.y, t: 1, dur: 1 };
        snapTo(sprite, center.x, center.y);
        this.convoySprites.set(convoy.prisoner, sprite);
      } else {
        retarget(sprite, center.x, center.y, dayMs);
      }
    }
    for (const [id, sprite] of this.convoySprites) {
      if (!seen.has(id)) {
        sprite.root.destroy();
        this.convoySprites.delete(id);
      }
    }
  }

  // 引きの倍率では交戦を交差する刃のマーカーに畳む
  private updateBattles(): void {
    const seen = new Set<string>();
    for (const battle of this.world.battles) {
      seen.add(battle.id);
      let mark = this.battleMarks.get(battle.id);
      if (mark === undefined) {
        mark = new Container();
        const blades = new Graphics();
        blades.moveTo(-6, -6).lineTo(6, 6).stroke({ width: 2.4, color: 0xff5544 });
        blades.moveTo(6, -6).lineTo(-6, 6).stroke({ width: 2.4, color: 0xffd0a0 });
        mark.addChild(blades);
        const label = new Text({
          text: battle.placeId !== undefined ? `攻城 ${this.names.place(battle.placeId)}` : "交戦",
          style: { fontFamily: FONT_JP, fontSize: 12, fill: 0xffb0a0, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 8;
        mark.addChild(label);
        this.battleLayer.addChild(mark);
        this.battleMarks.set(battle.id, mark);
      }
      const center = tileCenter(battle.x, battle.y);
      mark.x = center.x;
      mark.y = center.y;
      mark.visible = this.zoomNow < 0.9;
    }
    for (const [id, mark] of this.battleMarks) {
      if (!seen.has(id)) {
        mark.destroy();
        this.battleMarks.delete(id);
      }
    }
  }

  // 勢力の支配領域を塗り直す（Europa Universalis風の勢力図）。都市の所有交代など、
  // 領域が動きうる出来事の後に呼ぶ——毎フレームではなく、必要な時にだけ計算する重い処理
  refreshTerritory(): void {
    const { owner, factionIds, centroids } = computeTerritory(this.world);
    const ctx = this.territoryCanvas.getContext("2d");
    if (ctx !== null) {
      const w = this.territoryCanvas.width;
      const h = this.territoryCanvas.height;
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const colors = factionIds.map((fid) => factionColor(fid));
      for (let i = 0; i < owner.length; i += 1) {
        const fi = owner[i] as number;
        const p = i * 4;
        if (fi === -1) {
          continue; // 透明（アルファ0）のまま＝無所属
        }
        const color = colors[fi] as number;
        data[p] = (color >> 16) & 0xff;
        data[p + 1] = (color >> 8) & 0xff;
        data[p + 2] = color & 0xff;
        data[p + 3] = 58; // 淡く色分け（下の地形が透けて見える）
      }
      ctx.putImageData(img, 0, 0);
      this.territorySprite.texture.source.update();
    }

    // 勢力名ラベル: 支配域の重心に大きく淡く置く
    const seen = new Set<string>();
    for (const [fid, centroid] of centroids) {
      const faction = this.world.factions.get(fid);
      if (faction === undefined || faction.fallenTick !== undefined) {
        continue;
      }
      seen.add(fid);
      let label = this.factionLabels.get(fid);
      if (label === undefined) {
        label = new Text({
          text: this.names.faction(fid),
          style: {
            fontFamily: FONT_JP,
            fontSize: 24,
            fontWeight: "700",
            fill: factionColor(fid),
            stroke: { color: 0x000000, width: 4 },
            letterSpacing: 3,
          },
        });
        label.anchor.set(0.5, 0.5);
        label.alpha = 0.5;
        this.factionLabelLayer.addChild(label);
        this.factionLabels.set(fid, label);
      }
      label.text = this.names.faction(fid);
      const c = tileCenter(centroid.x, centroid.y);
      label.x = c.x;
      label.y = c.y;
    }
    for (const [fid, label] of this.factionLabels) {
      if (!seen.has(fid)) {
        label.destroy();
        this.factionLabels.delete(fid);
      }
    }

    // 勢力間の敵対線: 遺恨(feud)の濃さを線の太さと赤さで表す（友好関係は勢力単位では追跡していない）
    this.relationG.clear();
    const drawn = new Set<string>();
    for (const faction of this.world.factions.values()) {
      if (faction.fallenTick !== undefined || !centroids.has(faction.id)) {
        continue;
      }
      for (const [otherId, heat] of faction.feud) {
        if (heat < 20) {
          continue;
        }
        const key = [faction.id, otherId].sort().join(":");
        if (drawn.has(key)) {
          continue;
        }
        drawn.add(key);
        const other = this.world.factions.get(otherId);
        const otherCentroid = centroids.get(otherId);
        if (other === undefined || other.fallenTick !== undefined || otherCentroid === undefined) {
          continue;
        }
        const ca = centroids.get(faction.id);
        if (ca === undefined) {
          continue;
        }
        const from = tileCenter(ca.x, ca.y);
        const to = tileCenter(otherCentroid.x, otherCentroid.y);
        const alpha = Math.min(0.75, 0.15 + heat / 130);
        const width = Math.min(4, 1 + heat / 40);
        this.relationG.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width, color: 0xcc3322, alpha });
      }
    }
  }

  // 攻囲される都市の周りに輪を描く（遠目にも「今どこが囲まれているか」がひと目で分かる）
  private redrawSieges(): void {
    this.siegeG.clear();
    for (const battle of this.world.battles) {
      if (!battle.siege || battle.placeId === undefined) {
        continue;
      }
      const place = this.world.places.get(battle.placeId);
      if (place === undefined) {
        continue;
      }
      const center = tileCenter(place.gridX, place.gridY);
      const attackerColor = factionColor(
        this.world.armies.find((a) => a.battleId === battle.id && a.target === battle.placeId)?.factionId,
      );
      const radius = 16 + Math.sin(this.flicker / 260) * 2;
      this.siegeG.circle(center.x, center.y, radius).stroke({ width: 1.6, color: attackerColor, alpha: 0.55 });
    }
  }

  private redrawCorpses(): void {
    this.corpseG.clear();
    for (const corpse of this.world.corpses) {
      const age = this.world.tick - corpse.tick;
      if (age > 360) {
        continue; // 一年経てば骨も土に還る
      }
      const alpha = Math.max(0.08, 0.55 - age / 720);
      const c = tileCenter(corpse.x, corpse.y);
      const x = c.x + (decoRand(`c${corpse.tick}`, 1) - 0.5) * 5;
      const y = c.y + (decoRand(`c${corpse.tick}`, 2) - 0.5) * 5;
      this.corpseG.moveTo(x - 2, y).lineTo(x + 2, y).stroke({ width: 1.2, color: 0x968a76, alpha });
      this.corpseG.moveTo(x, y - 2).lineTo(x, y + 1.6).stroke({ width: 1.2, color: 0x968a76, alpha });
    }
  }

  // ---- カメラ倍率に応じた表示の遠近法 ----
  setZoom(zoom: number): void {
    this.zoomNow = zoom;
    const counter = Math.min(2.4, Math.max(0.75, 1 / zoom));
    for (const [, sprite] of this.officerSprites) {
      sprite.label.visible = zoom >= 0.58;
      sprite.root.scale.set(counter);
    }
    for (const [, sprite] of this.unitSprites) {
      sprite.label.visible = zoom >= 0.5;
      sprite.root.scale.set(counter);
    }
    for (const [id, label] of this.placeLabels) {
      const place = this.world.places.get(id);
      const minor = place !== undefined && (place.kind === "pass" || place.kind === "port" || place.kind === "town");
      label.visible = !minor || zoom >= 0.45;
      label.scale.set(counter);
    }
    for (const [, info] of this.placeInfos) {
      info.visible = zoom >= 0.38;
      info.scale.set(counter);
    }
    for (const [, sprite] of this.armySprites) {
      sprite.root.scale.set(counter);
    }
    for (const [, sprite] of this.convoySprites) {
      sprite.root.scale.set(Math.min(2, counter));
    }
    for (const [, label] of this.factionLabels) {
      // 勢力名は国土を眺める規模の文字。近寄るほど読み物の主役ではなくなるので控えめに縮む
      label.scale.set(Math.min(3.2, Math.max(1.1, counter * 1.4)));
    }
    for (const [, mark] of this.battleMarks) {
      mark.scale.set(Math.min(2.4, Math.max(1, counter)));
      mark.visible = zoom < 0.45;
    }
  }

  // ---- 演出（呼び出し側はタイル座標で渡す） ----
  pulseAt(x: number, y: number, color: number): void {
    const c = tileCenter(x, y);
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.pulses.push({ g, x: c.x, y: c.y, color, t: 0, dur: 1100 });
  }

  fireBurstAt(x: number, y: number): void {
    const c = tileCenter(x, y);
    for (let i = 0; i < 10; i += 1) {
      const g = new Graphics();
      g.circle(0, 0, 1.4 + decoRand(`${c.x}`, i) * 2.2).fill({
        color: i % 3 === 0 ? 0xffc46a : 0xe25822,
        alpha: 0.9,
      });
      g.x = c.x + (decoRand(`${c.x}`, i * 7) - 0.5) * 14;
      g.y = c.y + (decoRand(`${c.y}`, i * 11) - 0.5) * 8;
      this.fxLayer.addChild(g);
      this.particles.push({
        g,
        vx: (decoRand(`${c.x}`, i * 13) - 0.5) * 8,
        vy: -14 - decoRand(`${c.y}`, i * 17) * 18,
        t: 0,
        dur: 900 + decoRand(`${c.x}${c.y}`, i * 19) * 700,
      });
    }
  }

  // 既にピクセル座標（中心済み）を渡す想定
  floatText(x: number, y: number, message: string, color: number): void {
    const t = new Text({
      text: message,
      style: { fontFamily: FONT_JP, fontSize: 13, fill: color, stroke: { color: 0x000000, width: 3 } },
    });
    t.anchor.set(0.5, 1);
    t.x = x;
    t.y = y;
    t.scale.set(Math.min(2.4, Math.max(0.8, 1 / this.zoomNow)));
    this.fxLayer.addChild(t);
    this.floats.push({ t, vy: -14, age: 0, dur: 1700 });
  }

  // ---- 毎フレーム: 等速直線移動の補間と持続現象（炎・煙・矢の雨） ----
  update(deltaMS: number): void {
    this.flicker += deltaMS;
    this.redrawSieges();
    const advance = (s: MoveState): void => {
      if (s.t >= s.dur) {
        return;
      }
      s.t = Math.min(s.dur, s.t + deltaMS);
      const k = s.t / s.dur; // 線形補間（イージング無し・等速）
      s.root.x = s.fromX + (s.toX - s.fromX) * k;
      s.root.y = s.fromY + (s.toY - s.fromY) * k;
    };
    for (const [, s] of this.officerSprites) {
      advance(s);
    }
    for (const [, s] of this.armySprites) {
      advance(s);
    }
    for (const [, s] of this.unitSprites) {
      advance(s);
    }
    for (const [, s] of this.convoySprites) {
      advance(s);
    }

    // 炎と矢の雨（世界の持続現象を毎フレーム描き直す）
    this.liveFx.clear();
    const phase = Math.floor(this.flicker / 130);
    for (const [idx] of this.world.grid.fires) {
      const fx = idx % this.world.grid.w;
      const fy = Math.floor(idx / this.world.grid.w);
      const { x, y } = tileCenter(fx, fy);
      const left = x - CELL / 2;
      const top = y - CELL / 2;
      const hot = (phase + idx) % 2 === 0;
      this.liveFx.rect(left, top, CELL, CELL).fill({ color: hot ? 0xe25822 : 0xff9a3d, alpha: 0.85 });
      this.liveFx
        .poly([left + 1, top + CELL, x, top - 2 - (hot ? 2 : 0), left + CELL - 1, top + CELL])
        .fill({ color: 0xffc46a, alpha: 0.55 });
    }
    for (const volley of this.world.volleys) {
      for (const c of volley.cells) {
        const { x: bx, y: by } = tileCenter(c.x, c.y);
        for (let i = 0; i < 3; i += 1) {
          const sx = bx - CELL / 2 + ((phase * 3 + i * 5 + c.x) % CELL);
          const sy = by - CELL / 2 + ((phase * 5 + i * 3 + c.y) % CELL);
          this.liveFx.moveTo(sx, sy - 5).lineTo(sx + 2, sy).stroke({ width: 1, color: 0xe8dcc0, alpha: 0.85 });
        }
      }
    }

    // 煙: 燃えるタイルから風に乗って立ち上る
    this.smokeBudget += deltaMS;
    if (this.smokeBudget > 90 && this.world.grid.fires.size > 0 && this.particles.length < 140) {
      this.smokeBudget = 0;
      const fireIdxs = [...this.world.grid.fires.keys()];
      const pickIdx = fireIdxs[phase % fireIdxs.length];
      if (pickIdx !== undefined) {
        const fx = pickIdx % this.world.grid.w;
        const fy = Math.floor(pickIdx / this.world.grid.w);
        const { x, y } = tileCenter(fx, fy);
        const g = new Graphics();
        g.circle(0, 0, 2.4 + decoRand(`s${pickIdx}`, phase) * 3).fill({ color: 0x8a8a8a, alpha: 0.4 });
        g.x = x;
        g.y = y - CELL / 2;
        this.fxLayer.addChild(g);
        this.particles.push({
          g,
          vx: this.world.wind.x * 10 + (decoRand(`sw${pickIdx}`, phase) - 0.5) * 6,
          vy: -8 + this.world.wind.y * 6,
          t: 0,
          dur: 2200,
        });
      }
    }

    for (const pulse of [...this.pulses]) {
      pulse.t += deltaMS;
      const kk = pulse.t / pulse.dur;
      if (kk >= 1) {
        pulse.g.destroy();
        this.pulses = this.pulses.filter((p) => p !== pulse);
        continue;
      }
      pulse.g.clear();
      pulse.g.circle(pulse.x, pulse.y, 6 + kk * 22).stroke({ width: 2.4, color: pulse.color, alpha: 1 - kk });
    }
    for (const particle of [...this.particles]) {
      particle.t += deltaMS;
      const kk = particle.t / particle.dur;
      if (kk >= 1) {
        particle.g.destroy();
        this.particles = this.particles.filter((p) => p !== particle);
        continue;
      }
      particle.g.x += (particle.vx * deltaMS) / 1000;
      particle.g.y += (particle.vy * deltaMS) / 1000;
      particle.g.alpha = 1 - kk;
    }
    for (const float of [...this.floats]) {
      float.age += deltaMS;
      const kk = float.age / float.dur;
      if (kk >= 1) {
        float.t.destroy();
        this.floats = this.floats.filter((f) => f !== float);
        continue;
      }
      float.t.y += (float.vy * deltaMS) / 1000;
      float.t.alpha = kk < 0.7 ? 1 : 1 - (kk - 0.7) / 0.3;
    }
    for (const [id, sprite] of this.officerSprites) {
      if (sprite.fading === true) {
        sprite.root.alpha -= deltaMS / 1200;
        if (sprite.root.alpha <= 0) {
          sprite.root.destroy();
          this.officerSprites.delete(id);
        }
      }
    }
  }
}

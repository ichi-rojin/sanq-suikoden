// 責務: 世界俯瞰の実体描画。拠点・武将・軍勢・護送・交戦・火災・矢・亡骸を実シミュレーション状態から毎日更新する
// 軍勢はタイルを一歩ずつ進み、交戦中は各隊が世界地図の上に散開する——戦争画面は無い、世界そのものが戦場である
import { Container, Graphics, Text } from "pixi.js";
import type { NameRegistry, World } from "../src/model";
import { armyTroops, placePos } from "../src/model";
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

interface MovingSprite {
  root: Container;
  tx: number;
  ty: number;
  fading?: boolean;
}

interface OfficerSprite extends MovingSprite {
  dot: Graphics;
  label: Text;
}

export type SelectHandler = (kind: "officer" | "place" | "army", id: string) => void;

export class WorldView {
  readonly root = new Container();
  private readonly trailG = new Graphics(); // 行軍の足跡と進軍矢線
  private readonly corpseG = new Graphics(); // 世界に残る亡骸
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
  private readonly armySprites = new Map<string, MovingSprite & { label: Text; flag: Graphics }>();
  private readonly unitSprites = new Map<string, OfficerSprite>();
  private readonly convoySprites = new Map<string, MovingSprite>();
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
    this.root.addChild(this.trailG);
    this.root.addChild(this.corpseG);
    this.root.addChild(this.placeLayer);
    this.root.addChild(this.armyLayer);
    this.root.addChild(this.officerLayer);
    this.root.addChild(this.battleLayer);
    this.root.addChild(this.liveFx);
    this.root.addChild(this.fxLayer);
    this.buildPlaces();
    this.applyTick();
  }

  pos(placeId: string): { x: number; y: number } {
    const p = placePos(this.world, placeId);
    return { x: p.x * CELL, y: p.y * CELL };
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
      c.x = place.gridX * CELL;
      c.y = place.gridY * CELL;
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

  // ---- 日次更新: 実体の目標位置を差し替える（滑らかな移動はupdateが担う） ----
  applyTick(): void {
    for (const placeId of this.world.places.keys()) {
      this.redrawPlace(placeId);
    }
    this.updateOfficers();
    this.updateArmies();
    this.updateConvoys();
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
      return battle !== undefined ? { x: battle.x * CELL, y: battle.y * CELL } : undefined;
    }
    const s = this.armySprites.get(id);
    return s !== undefined ? { x: s.root.x, y: s.root.y } : undefined;
  }

  private updateOfficers(): void {
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
      const tx = officer.pos.x * CELL + off.x;
      const ty = officer.pos.y * CELL + off.y;
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
        root.x = tx;
        root.y = ty;
        root.eventMode = "static";
        root.cursor = "pointer";
        root.on("pointertap", () => this.onSelect("officer", officer.id));
        this.officerLayer.addChild(root);
        sprite = { root, dot, label, tx, ty };
        this.officerSprites.set(officer.id, sprite);
      }
      sprite.tx = tx;
      sprite.ty = ty;
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

  private updateArmies(): void {
    const seenArmies = new Set<string>();
    const seenUnits = new Set<string>();
    this.trailG.clear();

    for (const army of this.world.armies) {
      seenArmies.add(army.id);
      const color = factionColor(army.factionId);
      const fighting = army.battleId !== undefined || army.state === "fight";

      // 行軍の足跡（兵列）と進軍先の矢線
      if (!fighting) {
        for (let i = 0; i < army.trail.length; i += 1) {
          const step = army.trail[i];
          if (step === undefined) {
            continue;
          }
          this.trailG
            .circle(step.x * CELL + (i % 2) * 2 - 1, step.y * CELL + ((i + 1) % 2) * 2 - 1, 1.5)
            .fill({ color: 0xd8d2c0, alpha: 0.25 + (i / army.trail.length) * 0.55 });
        }
        const to = this.pos(army.target);
        this.trailG
          .moveTo(army.x * CELL, army.y * CELL)
          .lineTo(to.x, to.y)
          .stroke({ width: 1.4, color, alpha: 0.3 });
        this.trailG.circle(to.x, to.y, 6).stroke({ width: 1.6, color, alpha: 0.5 });
      }

      // 軍旗（行軍時のみ。交戦時は各隊が主役）
      let sprite = this.armySprites.get(army.id);
      if (sprite === undefined) {
        const root = new Container();
        const flag = new Graphics();
        root.addChild(flag);
        const label = new Text({
          text: "",
          style: { fontFamily: FONT_JP, fontSize: 9, fill: 0xffe9c0, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 8;
        root.addChild(label);
        root.x = army.x * CELL;
        root.y = army.y * CELL - 8;
        root.eventMode = "static";
        root.cursor = "pointer";
        const armyId = army.id;
        root.on("pointertap", () => this.onSelect("army", armyId));
        this.armyLayer.addChild(root);
        sprite = { root, tx: root.x, ty: root.y, label, flag };
        this.armySprites.set(army.id, sprite);
        flag.clear();
        for (let i = 0; i < 4; i += 1) {
          flag.circle(-6 + i * 4, 6 - (i % 2) * 2, 1.6).fill({ color: 0xd8d2c0, alpha: 0.9 });
        }
        flag.moveTo(0, 4).lineTo(0, -14).stroke({ width: 2, color: 0x999999 });
        flag.poly([0, -14, 13, -11, 0, -7]).fill(color).stroke({ width: 1, color: 0x000000 });
      }
      sprite.tx = army.x * CELL;
      sprite.ty = army.y * CELL - 8;
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
            root.x = unit.x * CELL;
            root.y = unit.y * CELL;
            root.eventMode = "static";
            root.cursor = "pointer";
            const oid = unit.officerId;
            root.on("pointertap", () => this.onSelect("officer", oid));
            this.armyLayer.addChild(root);
            us = { root, dot, label, tx: root.x, ty: root.y };
            this.unitSprites.set(key, us);
          }
          us.tx = unit.x * CELL;
          us.ty = unit.y * CELL;
          us.dot.clear();
          if (unit.hidden) {
            us.dot.circle(0, 0, 3.6).stroke({ width: 1, color, alpha: 0.35 });
            us.label.alpha = 0.3;
          } else {
            const troopRing = Math.max(2.6, Math.min(5, 2.4 + unit.troops / 260));
            us.dot.circle(0, 0, troopRing).fill(color).stroke({ width: 1.2, color: 0x0d0a07 });
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

  private updateConvoys(): void {
    const seen = new Set<string>();
    for (const convoy of this.world.convoys) {
      seen.add(convoy.prisoner);
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
        root.x = convoy.x * CELL;
        root.y = convoy.y * CELL;
        this.armyLayer.addChild(root);
        sprite = { root, tx: root.x, ty: root.y };
        this.convoySprites.set(convoy.prisoner, sprite);
      }
      sprite.tx = convoy.x * CELL;
      sprite.ty = convoy.y * CELL;
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
      mark.x = battle.x * CELL;
      mark.y = battle.y * CELL;
      mark.visible = this.zoomNow < 0.9;
    }
    for (const [id, mark] of this.battleMarks) {
      if (!seen.has(id)) {
        mark.destroy();
        this.battleMarks.delete(id);
      }
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
      const x = corpse.x * CELL + (decoRand(`c${corpse.tick}`, 1) - 0.5) * 5;
      const y = corpse.y * CELL + (decoRand(`c${corpse.tick}`, 2) - 0.5) * 5;
      this.corpseG.moveTo(x - 2, y).lineTo(x + 2, y).stroke({ width: 1.2, color: 0x968a76, alpha });
      this.corpseG.moveTo(x, y - 2).lineTo(x, y + 1.6).stroke({ width: 1.2, color: 0x968a76, alpha });
    }
  }

  // ---- カメラ倍率に応じた表示の遠近法 ----
  setZoom(zoom: number): void {
    this.zoomNow = zoom;
    const counter = Math.min(2.4, Math.max(0.75, 1 / zoom));
    for (const [, sprite] of this.officerSprites) {
      sprite.label.visible = zoom >= 1.15;
      sprite.root.scale.set(counter);
    }
    for (const [, sprite] of this.unitSprites) {
      sprite.label.visible = zoom >= 1.0;
      sprite.root.scale.set(counter);
    }
    for (const [id, label] of this.placeLabels) {
      const place = this.world.places.get(id);
      const minor = place !== undefined && (place.kind === "pass" || place.kind === "port" || place.kind === "town");
      label.visible = !minor || zoom >= 0.9;
      label.scale.set(counter);
    }
    for (const [, info] of this.placeInfos) {
      info.visible = zoom >= 0.75;
      info.scale.set(counter);
    }
    for (const [, sprite] of this.armySprites) {
      sprite.root.scale.set(counter);
    }
    for (const [, sprite] of this.convoySprites) {
      sprite.root.scale.set(Math.min(2, counter));
    }
    for (const [, mark] of this.battleMarks) {
      mark.scale.set(Math.min(2.4, Math.max(1, counter)));
      mark.visible = zoom < 0.9;
    }
  }

  // ---- 演出 ----
  pulseAt(x: number, y: number, color: number): void {
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.pulses.push({ g, x: x * CELL, y: y * CELL, color, t: 0, dur: 1100 });
  }

  fireBurstAt(x: number, y: number): void {
    const px = x * CELL;
    const py = y * CELL;
    for (let i = 0; i < 10; i += 1) {
      const g = new Graphics();
      g.circle(0, 0, 1.4 + decoRand(`${px}`, i) * 2.2).fill({
        color: i % 3 === 0 ? 0xffc46a : 0xe25822,
        alpha: 0.9,
      });
      g.x = px + (decoRand(`${px}`, i * 7) - 0.5) * 14;
      g.y = py + (decoRand(`${py}`, i * 11) - 0.5) * 8;
      this.fxLayer.addChild(g);
      this.particles.push({
        g,
        vx: (decoRand(`${px}`, i * 13) - 0.5) * 8,
        vy: -14 - decoRand(`${py}`, i * 17) * 18,
        t: 0,
        dur: 900 + decoRand(`${px}${py}`, i * 19) * 700,
      });
    }
  }

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

  // ---- 毎フレーム: 補間移動と持続現象（炎・煙・矢の雨） ----
  update(deltaMS: number): void {
    this.flicker += deltaMS;
    const k = Math.min(1, deltaMS / 150);
    const move = (s: MovingSprite): void => {
      s.root.x += (s.tx - s.root.x) * k;
      s.root.y += (s.ty - s.root.y) * k;
    };
    for (const [, s] of this.officerSprites) {
      move(s);
    }
    for (const [, s] of this.armySprites) {
      move(s);
    }
    for (const [, s] of this.unitSprites) {
      move(s);
    }
    for (const [, s] of this.convoySprites) {
      move(s);
    }

    // 炎と矢の雨（世界の持続現象を毎フレーム描き直す）
    this.liveFx.clear();
    const phase = Math.floor(this.flicker / 130);
    for (const [idx] of this.world.grid.fires) {
      const x = (idx % this.world.grid.w) * CELL;
      const y = Math.floor(idx / this.world.grid.w) * CELL;
      const hot = (phase + idx) % 2 === 0;
      this.liveFx.rect(x, y, CELL, CELL).fill({ color: hot ? 0xe25822 : 0xff9a3d, alpha: 0.85 });
      this.liveFx
        .poly([x + 1, y + CELL, x + CELL / 2, y - 2 - (hot ? 2 : 0), x + CELL - 1, y + CELL])
        .fill({ color: 0xffc46a, alpha: 0.55 });
    }
    for (const volley of this.world.volleys) {
      for (const c of volley.cells) {
        const bx = c.x * CELL;
        const by = c.y * CELL;
        for (let i = 0; i < 3; i += 1) {
          const sx = bx + ((phase * 3 + i * 5 + c.x) % CELL);
          const sy = by + ((phase * 5 + i * 3 + c.y) % CELL);
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
        const x = (pickIdx % this.world.grid.w) * CELL + CELL / 2;
        const y = Math.floor(pickIdx / this.world.grid.w) * CELL;
        const g = new Graphics();
        g.circle(0, 0, 2.4 + decoRand(`s${pickIdx}`, phase) * 3).fill({ color: 0x8a8a8a, alpha: 0.4 });
        g.x = x;
        g.y = y;
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

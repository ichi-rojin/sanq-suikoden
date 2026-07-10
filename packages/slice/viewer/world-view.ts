// 責務: 世界俯瞰マップの描画。地形・拠点・武将・軍勢・護送を実シミュレーション状態から毎月更新し、移動をトゥイーンで見せる
import { Container, Graphics, Text } from "pixi.js";
import type { NameRegistry, Officer, World } from "../src/model";
import { FONT_JP, PLACE_POS, decoRand, factionColor } from "./theme";

interface Tween {
  target: Container;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

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

interface OfficerSprite {
  root: Container;
  dot: Graphics;
  label: Text;
  fading: boolean;
}

export class WorldView {
  readonly root = new Container();
  private readonly terrainLayer = new Container();
  private readonly edgeLayer = new Container();
  private readonly placeLayer = new Container();
  private readonly armyLayer = new Container();
  private readonly officerLayer = new Container();
  private readonly fxLayer = new Container();

  private readonly placeBodies = new Map<string, Graphics>();
  private readonly placeInfos = new Map<string, Text>();
  private readonly officerSprites = new Map<string, OfficerSprite>();
  private readonly armySprites = new Map<string, Container>();
  private readonly convoySprites = new Map<string, Container>();
  private readonly armyLines = new Graphics();

  private tweens: Tween[] = [];
  private pulses: Pulse[] = [];
  private particles: Particle[] = [];

  constructor(
    private readonly world: World,
    private readonly names: NameRegistry,
  ) {
    this.root.addChild(this.terrainLayer);
    this.root.addChild(this.edgeLayer);
    this.root.addChild(this.placeLayer);
    this.root.addChild(this.armyLines);
    this.root.addChild(this.armyLayer);
    this.root.addChild(this.officerLayer);
    this.root.addChild(this.fxLayer);
    this.drawTerrain();
    this.drawEdges();
    this.buildPlaces();
    this.applyTick(new Map(), 0);
  }

  private pos(placeId: string): { x: number; y: number } {
    return PLACE_POS[placeId] ?? { x: 500, y: 380 };
  }

  // 武将ごとに拠点内の定位置（決定論的な散らし）を持つ
  private officerOffset(officerId: string): { x: number; y: number } {
    const angle = decoRand(officerId, 1) * Math.PI * 2;
    const radius = 26 + decoRand(officerId, 2) * 22;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 };
  }

  // ---- 静的地形（森・山・水郷・街道の趣き） ----
  private drawTerrain(): void {
    const g = new Graphics();
    // 地の色むら
    for (let i = 0; i < 70; i += 1) {
      const x = decoRand("ground", i * 2) * 1000;
      const y = decoRand("ground", i * 2 + 1) * 760;
      g.circle(x, y, 24 + decoRand("ground2", i) * 46).fill({
        color: 0x232b1d,
        alpha: 0.25,
      });
    }
    for (const place of this.world.places.values()) {
      const { x, y } = this.pos(place.id);
      // 水郷: 青い沼の連なり
      if (place.terrainWater >= 0.3) {
        for (let i = 0; i < 9; i += 1) {
          const dx = (decoRand(place.id, i * 3) - 0.5) * 150;
          const dy = (decoRand(place.id, i * 3 + 1) - 0.5) * 110;
          g.ellipse(x + dx, y + dy, 22 + decoRand(place.id, i * 3 + 2) * 22, 12).fill({
            color: 0x27506b,
            alpha: 0.5,
          });
        }
      }
      // 山地: 崖の峰
      if (place.terrainCliff >= 0.2) {
        for (let i = 0; i < 5; i += 1) {
          const dx = (decoRand(place.id, 40 + i * 2) - 0.5) * 130;
          const dy = (decoRand(place.id, 41 + i * 2) - 0.5) * 80 - 14;
          const s = 14 + decoRand(place.id, 60 + i) * 14;
          g.poly([x + dx - s, y + dy + s, x + dx, y + dy - s, x + dx + s, y + dy + s]).fill({
            color: 0x54483a,
            alpha: 0.9,
          });
          g.poly([x + dx - s * 0.3, y + dy - s * 0.35, x + dx, y + dy - s, x + dx + s * 0.3, y + dy - s * 0.35]).fill({
            color: 0x8d8071,
            alpha: 0.9,
          });
        }
      }
      // 森: 木立の点描
      if (place.terrainForest >= 0.2) {
        const count = Math.floor(place.terrainForest * 26);
        for (let i = 0; i < count; i += 1) {
          const dx = (decoRand(place.id, 100 + i * 2) - 0.5) * 190;
          const dy = (decoRand(place.id, 101 + i * 2) - 0.5) * 130 + 8;
          const s = 5 + decoRand(place.id, 140 + i) * 5;
          g.poly([x + dx - s, y + dy + s, x + dx, y + dy - s * 1.4, x + dx + s, y + dy + s]).fill({
            color: 0x1f3d22,
            alpha: 0.95,
          });
        }
      }
    }
    this.terrainLayer.addChild(g);
  }

  private drawEdges(): void {
    const g = new Graphics();
    for (const edge of this.world.edges) {
      const a = this.pos(edge.from);
      const b = this.pos(edge.to);
      // 街道は点線で
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const steps = Math.floor(len / 14);
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 0.55) / steps;
        g.moveTo(a.x + dx * t0, a.y + dy * t0)
          .lineTo(a.x + dx * t1, a.y + dy * t1)
          .stroke({ width: 3, color: 0x6a5c46, alpha: 0.55 });
      }
    }
    this.edgeLayer.addChild(g);
  }

  private buildPlaces(): void {
    for (const place of this.world.places.values()) {
      const { x, y } = this.pos(place.id);
      const c = new Container();
      c.x = x;
      c.y = y;
      const body = new Graphics();
      c.addChild(body);
      const label = new Text({
        text: this.names.place(place.id),
        style: { fontFamily: FONT_JP, fontSize: 15, fill: 0xf0e6d2, stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 0);
      label.y = 16;
      c.addChild(label);
      const info = new Text({
        text: "",
        style: { fontFamily: FONT_JP, fontSize: 10, fill: 0xbfae90, stroke: { color: 0x000000, width: 2 } },
      });
      info.anchor.set(0.5, 0);
      info.y = 34;
      c.addChild(info);
      this.placeLayer.addChild(c);
      this.placeBodies.set(place.id, body);
      this.placeInfos.set(place.id, info);
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
    if (place.kind === "capital" || place.kind === "county" || place.kind === "manor" || place.kind === "town") {
      const s = place.kind === "capital" ? 15 : place.kind === "town" ? 9 : 12;
      // 城郭
      body.rect(-s, -s * 0.8, s * 2, s * 1.6).fill({ color: 0x2a241c }).stroke({ width: 2, color });
      body.rect(-s * 0.45, -s * 1.25, s * 0.9, s * 0.55).fill({ color: 0x2a241c }).stroke({ width: 2, color });
      // 旗
      body.moveTo(s * 0.9, -s * 0.8).lineTo(s * 0.9, -s * 1.9).stroke({ width: 2, color: 0x777777 });
      body.poly([s * 0.9, -s * 1.9, s * 2.1, -s * 1.65, s * 0.9, -s * 1.35]).fill(color);
    } else if (place.kind === "lairsite" || place.kind === "marsh") {
      // 山寨: 柵の砦
      body.poly([-12, 8, 0, -12, 12, 8]).fill({ color: 0x33291f }).stroke({ width: 2, color });
      for (let i = -1; i <= 1; i += 1) {
        body.moveTo(i * 8, 9).lineTo(i * 8, 2).stroke({ width: 2, color: 0x77664e });
      }
      if (place.owner !== undefined) {
        body.moveTo(0, -12).lineTo(0, -24).stroke({ width: 2, color: 0x777777 });
        body.poly([0, -24, 13, -21, 0, -17]).fill(color);
      }
    } else {
      // 街道の難所
      body.circle(0, 0, 5).fill({ color: 0x4a4034 }).stroke({ width: 2, color: 0x6a5c46 });
    }
    // 戦禍の翳り
    if (place.devastation > 0) {
      body.circle(0, -2, 18).fill({ color: 0x000000, alpha: Math.min(0.5, place.devastation / 160) });
    }
    const bits: string[] = [];
    if (place.garrison >= 1) {
      bits.push(`兵${Math.floor(place.garrison)}`);
    }
    if (place.devastation >= 10) {
      bits.push(`戦禍${Math.floor(place.devastation)}`);
    }
    info.text = bits.join("　");
  }

  // ---- 月次更新: 状態反映とトゥイーン起動 ----
  applyTick(prevLocs: Map<string, string>, monthMs: number): void {
    for (const placeId of this.world.places.keys()) {
      this.redrawPlace(placeId);
    }
    this.updateOfficers(prevLocs, monthMs);
    this.updateArmies(monthMs);
    this.updateConvoys(monthMs);
  }

  private officerTint(officer: Officer): number {
    if (officer.status === "prisoner") {
      return 0x5a4a4a;
    }
    return factionColor(officer.factionId);
  }

  private updateOfficers(prevLocs: Map<string, string>, monthMs: number): void {
    for (const officer of this.world.officers.values()) {
      let sprite = this.officerSprites.get(officer.id);
      if (officer.status === "dead") {
        if (sprite !== undefined && !sprite.fading) {
          sprite.fading = true;
          this.pulse(officer.loc, 0x888888);
        }
        continue;
      }
      const off = this.officerOffset(officer.id);
      const base = this.pos(officer.loc);
      const tx = base.x + off.x;
      const ty = base.y + off.y;
      if (sprite === undefined) {
        const root = new Container();
        const dot = new Graphics();
        root.addChild(dot);
        const label = new Text({
          text: this.names.officerShort(officer.id),
          style: { fontFamily: FONT_JP, fontSize: 9, fill: 0xd8d2c0, stroke: { color: 0x000000, width: 2 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 5;
        label.alpha = 0.9;
        root.addChild(label);
        root.x = tx;
        root.y = ty;
        this.officerLayer.addChild(root);
        sprite = { root, dot, label, fading: false };
        this.officerSprites.set(officer.id, sprite);
      }
      // 身分で見た目を変える: 仕官=塗り丸 / 放浪=中抜き / 囚人=枷色
      sprite.dot.clear();
      const tint = this.officerTint(officer);
      if (officer.status === "roaming" || officer.status === "free") {
        sprite.dot.circle(0, 0, 4.5).fill({ color: 0x14110c }).stroke({ width: 2, color: tint });
      } else {
        sprite.dot.circle(0, 0, 4.5).fill(tint).stroke({ width: 1.5, color: 0x14110c });
      }
      if (officer.status === "prisoner") {
        sprite.dot.circle(0, 0, 7).stroke({ width: 1.5, color: 0x993333 });
      }
      const prev = prevLocs.get(officer.id);
      if (prev !== undefined && prev !== officer.loc && monthMs > 0) {
        this.addTween(sprite.root, tx, ty, monthMs * 0.65);
        this.trail(sprite.root.x, sprite.root.y, tx, ty, tint);
      } else {
        sprite.root.x = tx;
        sprite.root.y = ty;
      }
    }
  }

  private updateArmies(monthMs: number): void {
    const seen = new Set<string>();
    this.armyLines.clear();
    for (const army of this.world.armies) {
      seen.add(army.id);
      const color = factionColor(army.factionId);
      const at = this.pos(army.loc);
      let sprite = this.armySprites.get(army.id);
      if (sprite === undefined) {
        sprite = new Container();
        const g = new Graphics();
        // 軍旗
        g.moveTo(0, 4).lineTo(0, -22).stroke({ width: 3, color: 0x888888 });
        g.poly([0, -22, 20, -17, 0, -11]).fill(color).stroke({ width: 1, color: 0x000000 });
        g.circle(0, 6, 7).fill({ color, alpha: 0.9 }).stroke({ width: 2, color: 0x14110c });
        sprite.addChild(g);
        const label = new Text({
          text: "",
          style: { fontFamily: FONT_JP, fontSize: 10, fill: 0xffe9c0, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 12;
        sprite.addChild(label);
        sprite.x = at.x;
        sprite.y = at.y - 26;
        this.armyLayer.addChild(sprite);
        this.armySprites.set(army.id, sprite);
      }
      const label = sprite.children[1] as Text;
      label.text = `${this.names.faction(army.factionId)}軍 ${army.troops}`;
      this.addTween(sprite, at.x, at.y - 26, monthMs * 0.7);
      // 進軍先への矢線
      const to = this.pos(army.target);
      this.armyLines
        .moveTo(at.x, at.y)
        .lineTo(to.x, to.y)
        .stroke({ width: 2, color, alpha: 0.4 });
      this.armyLines.circle(to.x, to.y, 9).stroke({ width: 2, color, alpha: 0.6 });
    }
    for (const [id, sprite] of this.armySprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.armySprites.delete(id);
      }
    }
  }

  private updateConvoys(monthMs: number): void {
    const seen = new Set<string>();
    for (const convoy of this.world.convoys) {
      seen.add(convoy.prisoner);
      const at = this.pos(convoy.loc);
      let sprite = this.convoySprites.get(convoy.prisoner);
      if (sprite === undefined) {
        sprite = new Container();
        const g = new Graphics();
        g.rect(-7, -5, 14, 8).fill({ color: 0x3d3428 }).stroke({ width: 2, color: 0x993333 });
        g.circle(-5, 5, 3).fill(0x222222);
        g.circle(5, 5, 3).fill(0x222222);
        sprite.addChild(g);
        const label = new Text({
          text: `護送 ${this.names.officerShort(convoy.prisoner)}`,
          style: { fontFamily: FONT_JP, fontSize: 10, fill: 0xdd9999, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 8;
        sprite.addChild(label);
        sprite.x = at.x;
        sprite.y = at.y + 24;
        this.armyLayer.addChild(sprite);
        this.convoySprites.set(convoy.prisoner, sprite);
      }
      this.addTween(sprite, at.x, at.y + 24, monthMs * 0.7);
    }
    for (const [id, sprite] of this.convoySprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.convoySprites.delete(id);
      }
    }
  }

  // ---- 演出 ----
  addTween(target: Container, tx: number, ty: number, dur: number): void {
    this.tweens = this.tweens.filter((t) => t.target !== target);
    if (dur <= 0) {
      target.x = tx;
      target.y = ty;
      return;
    }
    this.tweens.push({ target, fx: target.x, fy: target.y, tx, ty, t: 0, dur });
  }

  private trail(fx: number, fy: number, tx: number, ty: number, color: number): void {
    const g = new Graphics();
    g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 1.5, color, alpha: 0.5 });
    this.fxLayer.addChild(g);
    this.pulses.push({ g, x: 0, y: 0, color, t: 0, dur: 1400 });
  }

  pulse(placeId: string, color: number): void {
    const { x, y } = this.pos(placeId);
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.pulses.push({ g, x, y, color, t: 0, dur: 1100 });
  }

  fire(placeId: string): void {
    const { x, y } = this.pos(placeId);
    for (let i = 0; i < 14; i += 1) {
      const g = new Graphics();
      g.circle(0, 0, 2 + decoRand(placeId, i) * 3).fill({
        color: i % 3 === 0 ? 0xffc46a : 0xe25822,
        alpha: 0.9,
      });
      g.x = x + (decoRand(placeId, i * 7) - 0.5) * 28;
      g.y = y + (decoRand(placeId, i * 11) - 0.5) * 14;
      this.fxLayer.addChild(g);
      this.particles.push({
        g,
        vx: (decoRand(placeId, i * 13) - 0.5) * 12,
        vy: -22 - decoRand(placeId, i * 17) * 26,
        t: 0,
        dur: 900 + decoRand(placeId, i * 19) * 700,
      });
    }
  }

  update(deltaMS: number): void {
    for (const tween of [...this.tweens]) {
      tween.t += deltaMS;
      const k = Math.min(1, tween.t / tween.dur);
      const e = 1 - (1 - k) * (1 - k);
      tween.target.x = tween.fx + (tween.tx - tween.fx) * e;
      tween.target.y = tween.fy + (tween.ty - tween.fy) * e;
      if (k >= 1) {
        this.tweens = this.tweens.filter((t) => t !== tween);
      }
    }
    for (const pulse of [...this.pulses]) {
      pulse.t += deltaMS;
      const k = pulse.t / pulse.dur;
      if (k >= 1) {
        pulse.g.destroy();
        this.pulses = this.pulses.filter((p) => p !== pulse);
        continue;
      }
      if (pulse.x !== 0 || pulse.y !== 0) {
        pulse.g.clear();
        pulse.g.circle(pulse.x, pulse.y, 10 + k * 34).stroke({
          width: 3,
          color: pulse.color,
          alpha: 1 - k,
        });
      } else {
        pulse.g.alpha = 1 - k;
      }
    }
    for (const particle of [...this.particles]) {
      particle.t += deltaMS;
      const k = particle.t / particle.dur;
      if (k >= 1) {
        particle.g.destroy();
        this.particles = this.particles.filter((p) => p !== particle);
        continue;
      }
      particle.g.x += (particle.vx * deltaMS) / 1000;
      particle.g.y += (particle.vy * deltaMS) / 1000;
      particle.g.alpha = 1 - k;
    }
    // 死者のフェードアウト
    for (const [id, sprite] of this.officerSprites) {
      if (sprite.fading) {
        sprite.root.alpha -= deltaMS / 1200;
        if (sprite.root.alpha <= 0) {
          sprite.root.destroy();
          this.officerSprites.delete(id);
        }
      }
    }
  }
}

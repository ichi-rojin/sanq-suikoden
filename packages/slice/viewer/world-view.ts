// 責務: 世界俯瞰の実体描画。拠点・武将・軍勢・護送を実シミュレーション状態から毎月更新し、街道に沿った行軍と現象演出を見せる
import { Container, Graphics, Text } from "pixi.js";
import type { NameRegistry, World } from "../src/model";
import { edgeKey } from "./terrain";
import { CELL, FONT_JP, decoRand, factionColor } from "./theme";

interface PathTween {
  target: Container;
  path: Array<[number, number]>;
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

interface FloatText {
  t: Text;
  vy: number;
  age: number;
  dur: number;
}

interface OfficerSprite {
  root: Container;
  dot: Graphics;
  label: Text;
  fading: boolean;
}

export type SelectHandler = (kind: "officer" | "place" | "army", id: string) => void;

export class WorldView {
  readonly root = new Container();
  private readonly placeLayer = new Container();
  private readonly armyLayer = new Container();
  private readonly officerLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly armyLines = new Graphics();

  private readonly placeMarks = new Map<string, Container>();
  private readonly placeBodies = new Map<string, Graphics>();
  private readonly placeInfos = new Map<string, Text>();
  private readonly placeLabels = new Map<string, Text>();
  private readonly officerSprites = new Map<string, OfficerSprite>();
  private readonly armySprites = new Map<string, Container>();
  private readonly convoySprites = new Map<string, Container>();

  private tweens: PathTween[] = [];
  private pulses: Pulse[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private zoomNow = 1;

  onSelect: SelectHandler = () => undefined;

  constructor(
    private readonly world: World,
    private readonly names: NameRegistry,
    private readonly roadPaths: Map<string, Array<[number, number]>>,
  ) {
    this.root.addChild(this.armyLines);
    this.root.addChild(this.placeLayer);
    this.root.addChild(this.armyLayer);
    this.root.addChild(this.officerLayer);
    this.root.addChild(this.fxLayer);
    this.buildPlaces();
    this.applyTick(new Map(), 0);
  }

  pos(placeId: string): { x: number; y: number } {
    const place = this.world.places.get(placeId);
    if (place === undefined) {
      return { x: 0, y: 0 };
    }
    return { x: place.gridX * CELL, y: place.gridY * CELL };
  }

  // 武将ごとに拠点内の定位置（決定論的な散らし）を持つ
  private officerOffset(officerId: string): { x: number; y: number } {
    const angle = decoRand(officerId, 1) * Math.PI * 2;
    const radius = 9 + decoRand(officerId, 2) * 9;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72 };
  }

  private road(from: string, to: string): Array<[number, number]> {
    const path = this.roadPaths.get(edgeKey(from, to));
    if (path !== undefined) {
      return path;
    }
    const a = this.pos(from);
    const b = this.pos(to);
    return [
      [a.x, a.y],
      [b.x, b.y],
    ];
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
      label.y = 8;
      c.addChild(label);
      const info = new Text({
        text: "",
        style: { fontFamily: FONT_JP, fontSize: 8, fill: 0xbfae90, stroke: { color: 0x000000, width: 2 } },
      });
      info.anchor.set(0.5, 0);
      info.y = isMinor ? 18 : 22;
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
        // 関: 門構え
        body.rect(-5, -4, 2, 8).fill(0x8a7a5e);
        body.rect(3, -4, 2, 8).fill(0x8a7a5e);
        body.rect(-6, -6, 12, 2.5).fill(0x8a7a5e);
        break;
      }
      case "port": {
        // 港: 碇
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
    info.text = bits.join(" ");
  }

  // ---- 月次更新 ----
  applyTick(prevLocs: Map<string, string>, monthMs: number): void {
    for (const placeId of this.world.places.keys()) {
      this.redrawPlace(placeId);
    }
    this.updateOfficers(prevLocs, monthMs);
    this.updateArmies(prevLocs, monthMs);
    this.updateConvoys(monthMs);
  }

  entityPosition(kind: "officer" | "place" | "army", id: string): { x: number; y: number } | undefined {
    if (kind === "place") {
      return this.pos(id);
    }
    if (kind === "officer") {
      const sprite = this.officerSprites.get(id);
      return sprite !== undefined ? { x: sprite.root.x, y: sprite.root.y } : undefined;
    }
    const sprite = this.armySprites.get(id);
    return sprite !== undefined ? { x: sprite.x, y: sprite.y } : undefined;
  }

  private updateOfficers(prevLocs: Map<string, string>, monthMs: number): void {
    const inArmies = new Set(this.world.armies.flatMap((a) => a.officers));
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
        sprite = { root, dot, label, fading: false };
        this.officerSprites.set(officer.id, sprite);
      }
      // 軍に編入中は軍旗で表現するため個人の点は消す
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
      const prev = prevLocs.get(officer.id);
      if (prev !== undefined && prev !== officer.loc && monthMs > 0 && sprite.root.visible) {
        const path = this.road(prev, officer.loc).map(([x, y], i, arr): [number, number] => {
          const k = i / Math.max(1, arr.length - 1);
          return [x + off.x * k, y + off.y * k];
        });
        path[0] = [sprite.root.x, sprite.root.y];
        this.addPathTween(sprite.root, path, monthMs * 0.75);
      } else {
        sprite.root.x = tx;
        sprite.root.y = ty;
      }
    }
  }

  private updateArmies(prevLocs: Map<string, string>, monthMs: number): void {
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
        // 行軍縦列（兵の点列）と軍旗
        for (let i = 0; i < 4; i += 1) {
          g.circle(-6 + i * 4, 6 - (i % 2) * 2, 1.6).fill({ color: 0xd8d2c0, alpha: 0.9 });
        }
        g.moveTo(0, 4).lineTo(0, -14).stroke({ width: 2, color: 0x999999 });
        g.poly([0, -14, 13, -11, 0, -7]).fill(color).stroke({ width: 1, color: 0x000000 });
        sprite.addChild(g);
        const label = new Text({
          text: "",
          style: { fontFamily: FONT_JP, fontSize: 9, fill: 0xffe9c0, stroke: { color: 0x000000, width: 3 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 8;
        sprite.addChild(label);
        sprite.x = at.x;
        sprite.y = at.y - 8;
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        const armyId = army.id;
        sprite.on("pointertap", () => this.onSelect("army", armyId));
        this.armyLayer.addChild(sprite);
        this.armySprites.set(army.id, sprite);
        prevLocs.set(`army:${army.id}`, army.loc);
      }
      const label = sprite.children[1] as Text;
      label.text = `${this.names.faction(army.factionId)}軍 ${army.troops}`;
      const prevLoc = prevLocs.get(`army:${army.id}`);
      if (prevLoc !== undefined && prevLoc !== army.loc && monthMs > 0) {
        const path = this.road(prevLoc, army.loc).map(([x, y]): [number, number] => [x, y - 8]);
        path[0] = [sprite.x, sprite.y];
        this.addPathTween(sprite, path, monthMs * 0.85);
      }
      // 進軍先への矢線
      const to = this.pos(army.target);
      this.armyLines.moveTo(at.x, at.y).lineTo(to.x, to.y).stroke({ width: 1.6, color, alpha: 0.35 });
      this.armyLines.circle(to.x, to.y, 6).stroke({ width: 1.6, color, alpha: 0.55 });
    }
    for (const [id, sprite] of this.armySprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.armySprites.delete(id);
      }
    }
  }

  armyPrevLocs(target: Map<string, string>): void {
    for (const army of this.world.armies) {
      target.set(`army:${army.id}`, army.loc);
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
        g.rect(-4.5, -3, 9, 5).fill({ color: 0x3d3428 }).stroke({ width: 1.4, color: 0x993333 });
        g.circle(-3, 3, 1.8).fill(0x222222);
        g.circle(3, 3, 1.8).fill(0x222222);
        sprite.addChild(g);
        const label = new Text({
          text: `護送 ${this.names.officerShort(convoy.prisoner)}`,
          style: { fontFamily: FONT_JP, fontSize: 8, fill: 0xdd9999, stroke: { color: 0x000000, width: 2 } },
        });
        label.anchor.set(0.5, 0);
        label.y = 5;
        sprite.addChild(label);
        sprite.x = at.x;
        sprite.y = at.y + 12;
        this.armyLayer.addChild(sprite);
        this.convoySprites.set(convoy.prisoner, sprite);
      }
      this.addPathTween(sprite, [[sprite.x, sprite.y], [at.x, at.y + 12]], monthMs * 0.8);
    }
    for (const [id, sprite] of this.convoySprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.convoySprites.delete(id);
      }
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
      sprite.scale.set(counter);
    }
    for (const [, sprite] of this.convoySprites) {
      sprite.scale.set(Math.min(2, counter));
    }
  }

  // ---- 演出 ----
  private addPathTween(target: Container, path: Array<[number, number]>, dur: number): void {
    this.tweens = this.tweens.filter((t) => t.target !== target);
    if (dur <= 0 || path.length < 2) {
      const last = path[path.length - 1];
      if (last !== undefined) {
        target.x = last[0];
        target.y = last[1];
      }
      return;
    }
    this.tweens.push({ target, path, t: 0, dur });
  }

  pulse(placeId: string, color: number): void {
    const { x, y } = this.pos(placeId);
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.pulses.push({ g, x, y, color, t: 0, dur: 1100 });
  }

  fire(placeId: string): void {
    const { x, y } = this.pos(placeId);
    for (let i = 0; i < 12; i += 1) {
      const g = new Graphics();
      g.circle(0, 0, 1.4 + decoRand(placeId, i) * 2.2).fill({
        color: i % 3 === 0 ? 0xffc46a : 0xe25822,
        alpha: 0.9,
      });
      g.x = x + (decoRand(placeId, i * 7) - 0.5) * 16;
      g.y = y + (decoRand(placeId, i * 11) - 0.5) * 8;
      this.fxLayer.addChild(g);
      this.particles.push({
        g,
        vx: (decoRand(placeId, i * 13) - 0.5) * 8,
        vy: -14 - decoRand(placeId, i * 17) * 18,
        t: 0,
        dur: 900 + decoRand(placeId, i * 19) * 700,
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

  update(deltaMS: number): void {
    for (const tween of [...this.tweens]) {
      tween.t += deltaMS;
      const k = Math.min(1, tween.t / tween.dur);
      // ポリラインに沿って補間
      const segs = tween.path.length - 1;
      const ft = k * segs;
      const idx = Math.min(segs - 1, Math.floor(ft));
      const local = ft - idx;
      const [x0, y0] = tween.path[idx] as [number, number];
      const [x1, y1] = tween.path[idx + 1] as [number, number];
      tween.target.x = x0 + (x1 - x0) * local;
      tween.target.y = y0 + (y1 - y0) * local;
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
      pulse.g.clear();
      pulse.g.circle(pulse.x, pulse.y, 6 + k * 22).stroke({ width: 2.4, color: pulse.color, alpha: 1 - k });
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
    for (const float of [...this.floats]) {
      float.age += deltaMS;
      const k = float.age / float.dur;
      if (k >= 1) {
        float.t.destroy();
        this.floats = this.floats.filter((f) => f !== float);
        continue;
      }
      float.t.y += (float.vy * deltaMS) / 1000;
      float.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
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

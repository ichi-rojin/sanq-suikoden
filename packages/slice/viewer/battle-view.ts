// 責務: 合戦のマップ上再生。リプレイ盤面を戦場の実座標に重ね、延焼・矢・突撃を「世界の現象」として世界と並行して見せる
import { Container, Graphics, Text } from "pixi.js";
import type { BattleReplay, NameRegistry, WorldEvent } from "../src/model";
import {
  ATTACKER_GLYPHS,
  CELL,
  DEFENDER_GLYPHS,
  FONT_JP,
  TERRAIN_COLORS,
  decoRand,
  factionColor,
} from "./theme";

const GRID = 13;
const BCELL = CELL * 1.35; // 戦場タイルの描画寸法
const SPAN = GRID * BCELL;

interface ActiveBattle {
  replay: BattleReplay;
  container: Container;
  marker: Container; // 引き（低倍率）では盤面の代わりに交戦マーカーを見せる
  grid: Graphics;
  fx: Graphics;
  unitLayer: Container;
  frameIndex: number;
  frameTimer: number;
  holdTimer: number;
  x: number;
  y: number;
  flicker: number;
}

export type BattleEventSink = (event: WorldEvent, x: number, y: number) => void;

export class BattleMapView {
  readonly root = new Container(); // WorldViewと同じワールド座標系に置く
  private active: ActiveBattle[] = [];
  private zoomNow = 1;
  private eventOf: (id: string) => WorldEvent | undefined = () => undefined;
  onFrameEvent: BattleEventSink = () => undefined;

  constructor(private readonly names: NameRegistry) {}

  connectEvents(eventOf: (id: string) => WorldEvent | undefined): void {
    this.eventOf = eventOf;
  }

  get playing(): boolean {
    return this.active.length > 0;
  }

  // カメラ追跡用: 直近の合戦の中心
  primaryPosition(): { x: number; y: number } | undefined {
    const last = this.active[this.active.length - 1];
    return last === undefined ? undefined : { x: last.x, y: last.y };
  }

  play(replay: BattleReplay, x: number, y: number): void {
    const container = new Container();
    container.x = x - SPAN / 2;
    container.y = y - SPAN / 2;

    const backdrop = new Graphics();
    backdrop
      .roundRect(-8, -22, SPAN + 16, SPAN + 30, 6)
      .fill({ color: 0x0d0a07, alpha: 0.82 })
      .stroke({ width: 2, color: 0x8a744e });
    backdrop.rect(-8, -22, SPAN + 16, 4).fill(factionColor(replay.attackerFaction));
    backdrop.rect(-8, SPAN + 4, SPAN + 16, 4).fill(factionColor(replay.defenderFaction));
    container.addChild(backdrop);

    const title = new Text({
      text: `合戦　${this.names.place(replay.loc)}${replay.siege ? "（攻城）" : ""}`,
      style: { fontFamily: FONT_JP, fontSize: 11, fill: 0xf3e3bd, stroke: { color: 0x000000, width: 3 } },
    });
    title.x = 0;
    title.y = -20;
    container.addChild(title);

    const grid = new Graphics();
    container.addChild(grid);
    const unitLayer = new Container();
    container.addChild(unitLayer);
    const fx = new Graphics();
    container.addChild(fx);

    this.root.addChild(container);

    // 引きの倍率用マーカー（交差する刃と地名）
    const marker = new Container();
    const blades = new Graphics();
    blades.moveTo(-6, -6).lineTo(6, 6).stroke({ width: 2.4, color: 0xff5544 });
    blades.moveTo(6, -6).lineTo(-6, 6).stroke({ width: 2.4, color: 0xffd0a0 });
    marker.addChild(blades);
    const markerLabel = new Text({
      text: `交戦 ${this.names.place(replay.loc)}`,
      style: { fontFamily: FONT_JP, fontSize: 12, fill: 0xffb0a0, stroke: { color: 0x000000, width: 3 } },
    });
    markerLabel.anchor.set(0.5, 0);
    markerLabel.y = 8;
    marker.addChild(markerLabel);
    marker.x = x;
    marker.y = y;
    this.root.addChild(marker);

    const battle: ActiveBattle = {
      replay,
      container,
      marker,
      grid,
      fx,
      unitLayer,
      frameIndex: 0,
      frameTimer: 0,
      holdTimer: 0,
      x,
      y,
      flicker: 0,
    };
    this.active.push(battle);
    this.applyZoomTo(battle);
    this.renderFrame(battle);
  }

  // 低倍率では盤面を畳んでマーカーだけにする（全景が黒箱で覆われないように）
  setZoom(zoom: number): void {
    this.zoomNow = zoom;
    for (const battle of this.active) {
      this.applyZoomTo(battle);
    }
  }

  private applyZoomTo(battle: ActiveBattle): void {
    const showBoard = this.zoomNow >= 0.8;
    battle.container.visible = showBoard;
    battle.marker.visible = !showBoard;
    battle.marker.scale.set(Math.min(2.4, Math.max(1, 1 / this.zoomNow)));
  }

  private renderFrame(battle: ActiveBattle): void {
    const frame = battle.replay.frames[battle.frameIndex];
    if (frame === undefined) {
      return;
    }
    const atk = factionColor(battle.replay.attackerFaction);
    const def = factionColor(battle.replay.defenderFaction);
    battle.grid.clear();
    battle.fx.clear();
    battle.unitLayer.removeChildren();

    for (let y = 0; y < frame.grid.length; y += 1) {
      const row = [...(frame.grid[y] ?? "")];
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x] ?? "・";
        const isAtk = ATTACKER_GLYPHS.has(ch);
        const isDef = DEFENDER_GLYPHS.has(ch);
        let color = TERRAIN_COLORS[ch] ?? 0x4c5b3c;
        if (ch === "炎") {
          color = (battle.flicker + x + y) % 2 === 0 ? 0xe25822 : 0xff9a3d;
        }
        if (isAtk || isDef) {
          color = 0x4c5b3c;
        }
        battle.grid
          .rect(x * BCELL, y * BCELL, BCELL - 0.6, BCELL - 0.6)
          .fill({ color, alpha: 0.92 });
        if (ch === "木") {
          battle.grid
            .poly([
              x * BCELL + BCELL / 2 - 3, y * BCELL + BCELL - 2,
              x * BCELL + BCELL / 2, y * BCELL + 2,
              x * BCELL + BCELL / 2 + 3, y * BCELL + BCELL - 2,
            ])
            .fill({ color: 0x1d331c, alpha: 0.95 });
        }
        if (isAtk || isDef) {
          const cx = x * BCELL + BCELL / 2;
          const cy = y * BCELL + BCELL / 2;
          const g = new Graphics();
          g.circle(cx, cy, 4.6).fill(isAtk ? atk : def).stroke({ width: 1.2, color: 0x0d0a07 });
          battle.unitLayer.addChild(g);
          const unit = battle.replay.units.find((u) => u.glyph === ch);
          if (unit !== undefined) {
            const label = new Text({
              text: this.names.officerShort(unit.officerId),
              style: { fontFamily: FONT_JP, fontSize: 6.5, fill: 0xe8dcc0, stroke: { color: 0x000000, width: 2 } },
            });
            label.anchor.set(0.5, 0);
            label.x = cx;
            label.y = cy + 4.5;
            battle.unitLayer.addChild(label);
          }
        }
      }
    }

    // この刻に起きた現象: 兵法ポップと盤上の走り書き、外部（ログ）への通知
    for (const id of frame.notes) {
      const event = this.eventOf(id);
      if (event === undefined) {
        continue;
      }
      this.onFrameEvent(event, battle.x, battle.y);
      this.noteFx(battle, event.kind, id);
    }
  }

  private noteFx(battle: ActiveBattle, kind: string, seed: string): void {
    const r = (n: number): number => decoRand(seed, n);
    if (kind === "clash.volley" || kind === "clash.stray") {
      const color = kind === "clash.stray" ? 0xff5544 : 0xd8cba8;
      for (let i = 0; i < 6; i += 1) {
        const x0 = r(i * 2) * SPAN;
        const y0 = r(i * 2 + 1) * SPAN * 0.4;
        battle.fx.moveTo(x0, y0).lineTo(x0 + 6, y0 + 14).stroke({ width: 1.2, color, alpha: 0.9 });
      }
    } else if (kind === "clash.sorcery") {
      for (let i = 0; i < 3; i += 1) {
        const x0 = SPAN * 0.2 + r(i) * SPAN * 0.6;
        battle.fx
          .moveTo(x0, 0)
          .lineTo(x0 - 4, SPAN * 0.3)
          .lineTo(x0 + 3, SPAN * 0.55)
          .stroke({ width: 1.6, color: 0xb388ff, alpha: 0.9 });
      }
    } else if (kind === "clash.rockfall") {
      for (let i = 0; i < 8; i += 1) {
        battle.fx
          .circle(r(i * 3) * SPAN, r(i * 3 + 1) * SPAN * 0.5, 1.5 + r(i) * 2)
          .fill({ color: 0x8d8071, alpha: 0.85 });
      }
    }
  }

  // 合戦はおよそ2.5ヶ月ぶんの世界時間をかけて再生される
  update(deltaMS: number, monthMs: number): void {
    for (const battle of [...this.active]) {
      const frameMs = Math.max(120, (monthMs * 2.5) / battle.replay.frames.length);
      battle.frameTimer += deltaMS;
      if (battle.frameTimer < frameMs) {
        continue;
      }
      battle.frameTimer = 0;
      battle.flicker += 1;
      if (battle.frameIndex < battle.replay.frames.length - 1) {
        battle.frameIndex += 1;
        this.renderFrame(battle);
      } else {
        battle.holdTimer += frameMs;
        if (battle.holdTimer >= 900) {
          battle.container.destroy();
          battle.marker.destroy();
          this.active = this.active.filter((b) => b !== battle);
        }
      }
      // マーカーの点滅
      battle.marker.alpha = battle.flicker % 2 === 0 ? 1 : 0.55;
    }
  }
}

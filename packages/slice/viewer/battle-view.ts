// 責務: 合戦の実況再生。シミュレーションが記録したリプレイ盤面を、延焼・矢・突撃など「世界の現象」としてそのまま可視化する
import { Container, Graphics, Text } from "pixi.js";
import type { BattleReplay, NameRegistry, WorldEvent } from "../src/model";
import { ATTACKER_GLYPHS, DEFENDER_GLYPHS, FONT_JP, TERRAIN_COLORS, decoRand, factionColor } from "./theme";

const CELL = 30;
const GRID = 13;
const BASE_FRAME_MS = 430;
const PANEL_W = GRID * CELL + 40;

export class BattleView {
  readonly root = new Container();
  playing = false;

  private replay: BattleReplay | undefined;
  private frameIndex = 0;
  private frameTimer = 0;
  private holdTimer = 0;
  private onDone: (() => void) | undefined;
  private flicker = 0;

  private readonly panel = new Graphics();
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly grid = new Graphics();
  private readonly unitLayer = new Container();
  private readonly fx = new Graphics();
  private readonly notes: Text;
  private readonly legend: Text;
  private eventOf: (id: string) => WorldEvent | undefined = () => undefined;
  private narrate: (event: WorldEvent) => string = () => "";
  private speedOf: () => number = () => 1;

  constructor(private readonly names: NameRegistry) {
    this.root.visible = false;
    this.root.addChild(this.panel);
    this.title = new Text({
      text: "",
      style: { fontFamily: FONT_JP, fontSize: 17, fill: 0xf3e3bd, stroke: { color: 0x000000, width: 3 } },
    });
    this.title.x = 20;
    this.title.y = 12;
    this.root.addChild(this.title);
    this.subtitle = new Text({
      text: "",
      style: { fontFamily: FONT_JP, fontSize: 12, fill: 0xcdb98f },
    });
    this.subtitle.x = 20;
    this.subtitle.y = 36;
    this.root.addChild(this.subtitle);
    this.grid.x = 20;
    this.grid.y = 58;
    this.root.addChild(this.grid);
    this.unitLayer.x = 20;
    this.unitLayer.y = 58;
    this.root.addChild(this.unitLayer);
    this.fx.x = 20;
    this.fx.y = 58;
    this.root.addChild(this.fx);
    this.notes = new Text({
      text: "",
      style: {
        fontFamily: FONT_JP,
        fontSize: 12,
        fill: 0xe8dcc0,
        wordWrap: true,
        wordWrapWidth: PANEL_W - 40,
        lineHeight: 17,
      },
    });
    this.notes.x = 20;
    this.notes.y = 58 + GRID * CELL + 10;
    this.root.addChild(this.notes);
    this.legend = new Text({
      text: "",
      style: { fontFamily: FONT_JP, fontSize: 10, fill: 0x9f947e, wordWrap: true, wordWrapWidth: PANEL_W - 40 },
    });
    this.legend.x = 20;
    this.legend.y = 58 + GRID * CELL + 86;
    this.root.addChild(this.legend);

    this.root.eventMode = "static";
    this.root.on("pointerdown", () => this.finish());
  }

  connectWorldEvents(eventOf: (id: string) => WorldEvent | undefined, narrate: (event: WorldEvent) => string): void {
    this.eventOf = eventOf;
    this.narrate = narrate;
  }

  setSpeed(speedOf: () => number): void {
    this.speedOf = speedOf;
  }

  play(replay: BattleReplay, onDone: () => void): void {
    this.replay = replay;
    this.onDone = onDone;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.holdTimer = 0;
    this.playing = true;
    this.root.visible = true;
    this.root.alpha = 1;

    const atk = factionColor(replay.attackerFaction);
    const def = factionColor(replay.defenderFaction);
    const panelH = 58 + GRID * CELL + 130;
    this.panel.clear();
    this.panel
      .rect(0, 0, PANEL_W, panelH)
      .fill({ color: 0x100d09, alpha: 0.93 })
      .stroke({ width: 3, color: 0x8a744e });
    this.panel.rect(0, 0, PANEL_W, 6).fill(atk);
    this.panel.rect(0, panelH - 6, PANEL_W, 6).fill(def);

    this.title.text = `合戦　${this.names.place(replay.loc)}${replay.siege ? "（攻城）" : ""}`;
    this.subtitle.text = `寄せ手 ${this.names.faction(replay.attackerFaction, replay.tick)}　対　守り手 ${this.names.faction(replay.defenderFaction, replay.tick)}　（押せば早送り）`;
    this.legend.text = replay.units
      .map((u) => `${u.glyph}=${this.names.officerShort(u.officerId)}`)
      .join("　");
    this.renderFrame();
  }

  private finish(): void {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.root.visible = false;
    this.replay = undefined;
    const done = this.onDone;
    this.onDone = undefined;
    if (done !== undefined) {
      done();
    }
  }

  private renderFrame(): void {
    const replay = this.replay;
    if (replay === undefined) {
      return;
    }
    const frame = replay.frames[this.frameIndex] ?? replay.frames[replay.frames.length - 1];
    if (frame === undefined) {
      return;
    }
    this.grid.clear();
    this.fx.clear();
    this.unitLayer.removeChildren();
    const atk = factionColor(replay.attackerFaction);
    const def = factionColor(replay.defenderFaction);

    for (let y = 0; y < frame.grid.length; y += 1) {
      const row = [...(frame.grid[y] ?? "")];
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x] ?? "・";
        const isAtk = ATTACKER_GLYPHS.has(ch);
        const isDef = DEFENDER_GLYPHS.has(ch);
        const base = TERRAIN_COLORS[ch];
        let color = base ?? 0x4c5b3c;
        if (ch === "炎") {
          // 炎は揺らめく
          color = (this.flicker + x + y) % 2 === 0 ? 0xe25822 : 0xff9a3d;
        }
        if (isAtk || isDef) {
          color = 0x4c5b3c;
        }
        this.grid
          .rect(x * CELL, y * CELL, CELL - 1, CELL - 1)
          .fill({ color, alpha: ch === "焦" ? 0.95 : 0.88 });
        if (ch === "木") {
          this.grid.poly([
            x * CELL + CELL / 2 - 7, y * CELL + CELL - 6,
            x * CELL + CELL / 2, y * CELL + 5,
            x * CELL + CELL / 2 + 7, y * CELL + CELL - 6,
          ]).fill({ color: 0x1d331c, alpha: 0.95 });
        }
        if (isAtk || isDef) {
          const cx = x * CELL + CELL / 2;
          const cy = y * CELL + CELL / 2;
          const g = new Graphics();
          g.circle(cx, cy, 11).fill(isAtk ? atk : def).stroke({ width: 2, color: 0x0d0a07 });
          this.unitLayer.addChild(g);
          const t = new Text({
            text: ch,
            style: { fontFamily: FONT_JP, fontSize: 13, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } },
          });
          t.anchor.set(0.5);
          t.x = cx;
          t.y = cy;
          this.unitLayer.addChild(t);
        }
      }
    }

    // 注記（この刻に起きた現象）と、現象ごとの盤上演出
    const lines: string[] = [];
    for (const id of frame.notes.slice(-4)) {
      const event = this.eventOf(id);
      if (event === undefined) {
        continue;
      }
      lines.push(`・${this.narrate(event)}`);
      this.playNoteFx(event.kind, id);
    }
    this.notes.text = lines.join("\n");
  }

  // 矢の雨・流れ矢・突撃・妖術などを盤面上の走り書きで表す
  private playNoteFx(kind: string, seed: string): void {
    const w = GRID * CELL;
    const r = (n: number): number => decoRand(seed, n);
    if (kind === "clash.volley" || kind === "clash.stray") {
      const color = kind === "clash.stray" ? 0xff5544 : 0xd8cba8;
      for (let i = 0; i < 7; i += 1) {
        const x0 = r(i * 2) * w;
        const y0 = r(i * 2 + 1) * w * 0.4;
        this.fx.moveTo(x0, y0).lineTo(x0 + 14, y0 + 30).stroke({ width: 2, color, alpha: 0.85 });
      }
    } else if (kind === "clash.sorcery") {
      for (let i = 0; i < 4; i += 1) {
        const x0 = w * 0.2 + r(i) * w * 0.6;
        this.fx
          .moveTo(x0, 0)
          .lineTo(x0 - 8, w * 0.3)
          .lineTo(x0 + 6, w * 0.55)
          .stroke({ width: 3, color: 0xb388ff, alpha: 0.9 });
      }
    } else if (kind === "clash.charge" || kind === "clash.knockback") {
      const y0 = r(1) * w;
      this.fx.moveTo(w * 0.15, y0).lineTo(w * 0.85, y0).stroke({ width: 4, color: 0xffffff, alpha: 0.35 });
    } else if (kind === "clash.rockfall") {
      for (let i = 0; i < 10; i += 1) {
        this.fx.circle(r(i * 3) * w, r(i * 3 + 1) * w * 0.5, 3 + r(i) * 4).fill({ color: 0x8d8071, alpha: 0.8 });
      }
    }
  }

  update(deltaMS: number): void {
    if (!this.playing || this.replay === undefined) {
      return;
    }
    const frameMs = BASE_FRAME_MS / this.speedOf();
    this.flicker += deltaMS > 120 ? 1 : 0;
    this.frameTimer += deltaMS;
    if (this.frameTimer >= frameMs) {
      this.frameTimer = 0;
      this.flicker += 1;
      if (this.frameIndex < this.replay.frames.length - 1) {
        this.frameIndex += 1;
        this.renderFrame();
      } else {
        this.holdTimer += frameMs;
        this.renderFrame();
        if (this.holdTimer >= 1200) {
          this.finish();
        }
      }
    }
  }

  get panelWidth(): number {
    return PANEL_W;
  }

  get panelHeight(): number {
    return 58 + GRID * CELL + 130;
  }
}

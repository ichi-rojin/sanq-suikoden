// 責務: 小窓ドラマの上演。世界の中で起きた人間の一幕（一騎討ち・義盟・処刑…）へカメラが寄るだけの演出装置
// 小窓が開いている間も世界は止まらない（裁定R-17）。戦闘システムとは無関係で、閉じても歴史は変わらない
import type { DramaKindLike } from "../data/text.data";
import { dramaLine, dramaTitle } from "../data/text.data";
import type { Drama, NameRegistry } from "../src/model";

const BEAT_MS = 1900; // 一拍の間
const HOLD_MS = 2400; // 最後の拍のあとの余韻

interface Playing {
  drama: Drama;
  beatIndex: number;
  timer: number;
}

export class DramaView {
  private readonly queue: Drama[] = [];
  private playing: Playing | undefined;
  private readonly box: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly castEl: HTMLElement;
  private readonly linesEl: HTMLElement;

  onFocus: (x: number, y: number) => void = () => undefined;

  constructor(
    root: HTMLElement,
    private readonly names: NameRegistry,
  ) {
    this.box = root;
    this.titleEl = root.querySelector(".drama-title") as HTMLElement;
    this.castEl = root.querySelector(".drama-cast") as HTMLElement;
    this.linesEl = root.querySelector(".drama-lines") as HTMLElement;
    const closeBtn = root.querySelector(".drama-close");
    closeBtn?.addEventListener("click", () => this.skip());
    const focusBtn = root.querySelector(".drama-focus");
    focusBtn?.addEventListener("click", () => {
      if (this.playing !== undefined) {
        this.onFocus(this.playing.drama.at.x, this.playing.drama.at.y);
      }
    });
    this.box.style.display = "none";
  }

  get active(): boolean {
    return this.playing !== undefined;
  }

  currentAt(): { x: number; y: number } | undefined {
    return this.playing?.drama.at;
  }

  enqueue(drama: Drama): void {
    // 同種の幕が積もり過ぎたら古い方を落とす（世界は速く、舞台はひとつ）
    if (this.queue.length >= 4) {
      this.queue.shift();
    }
    this.queue.push(drama);
  }

  skip(): void {
    this.playing = undefined;
    this.box.style.display = "none";
  }

  private begin(drama: Drama): void {
    this.playing = { drama, beatIndex: -1, timer: BEAT_MS };
    this.titleEl.textContent = `${dramaTitle(drama.kind as DramaKindLike)}${drama.loc !== undefined ? `　─ ${this.names.place(drama.loc)}` : ""}`;
    this.castEl.textContent = drama.actors.slice(0, 4).map((a) => this.names.officer(a)).join("　");
    this.linesEl.replaceChildren();
    this.box.style.display = "block";
    this.advance();
  }

  private advance(): void {
    if (this.playing === undefined) {
      return;
    }
    this.playing.beatIndex += 1;
    this.playing.timer = 0;
    const beat = this.playing.drama.beats[this.playing.beatIndex];
    if (beat === undefined) {
      return;
    }
    const actorNames = this.playing.drama.actors.map((a) => this.names.officerShort(a));
    const line = document.createElement("div");
    line.className = "drama-line";
    const text = dramaLine(beat.key, actorNames);
    if (beat.speaker !== undefined) {
      const speaker = document.createElement("span");
      speaker.className = "drama-speaker";
      speaker.textContent = this.names.officerShort(beat.speaker);
      line.appendChild(speaker);
    }
    line.appendChild(document.createTextNode(text));
    this.linesEl.appendChild(line);
  }

  update(deltaMS: number): void {
    if (this.playing === undefined) {
      const next = this.queue.shift();
      if (next !== undefined) {
        this.begin(next);
      }
      return;
    }
    this.playing.timer += deltaMS;
    const lastBeat = this.playing.beatIndex >= this.playing.drama.beats.length - 1;
    if (!lastBeat && this.playing.timer >= BEAT_MS) {
      this.advance();
    } else if (lastBeat && this.playing.timer >= HOLD_MS) {
      this.skip();
    }
  }
}

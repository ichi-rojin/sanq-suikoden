// 責務: Viewerの合成根。ブラウザ内でシミュレーションを月次で回し、俯瞰マップ・合戦再生・実況ログへ結線する
import { Application } from "pixi.js";
import { OFFICER_SEEDS } from "../data/officers.data";
import { createNameRegistry, narrateEvent } from "../data/text.data";
import { EDGE_SEEDS, EXILE_DESTINATION, FACTION_SEEDS, PLACE_SEEDS } from "../data/world.data";
import type { BattleReplay, World, WorldEvent } from "../src/model";
import { livingOfficers, monthOf, yearOf } from "../src/model";
import { buildWorld, stepMonth } from "../src/sim";
import { BattleView } from "./battle-view";
import { factionColor, logClassOf } from "./theme";
import { WorldView } from "./world-view";

const WORLD_W = 1000;
const WORLD_H = 760;
const BASE_MONTH_MS = 2400;
const LOG_LIMIT = 140;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`#${id} not found`);
  }
  return node as T;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get("seed") ?? "7");

  const names = createNameRegistry(OFFICER_SEEDS, FACTION_SEEDS, PLACE_SEEDS);
  const world: World = buildWorld(seed, {
    officers: OFFICER_SEEDS,
    factions: FACTION_SEEDS,
    places: PLACE_SEEDS,
    edges: EDGE_SEEDS,
    exileDest: EXILE_DESTINATION,
  });
  const eventIndex = new Map<string, WorldEvent>();
  const eventOf = (id: string): WorldEvent | undefined => eventIndex.get(id);

  const stage = el<HTMLDivElement>("stage");
  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x161510, antialias: true });
  stage.appendChild(app.canvas);

  const worldView = new WorldView(world, names);
  app.stage.addChild(worldView.root);
  const battleView = new BattleView(names);
  battleView.connectWorldEvents(eventOf, (e) => narrateEvent(e, names));
  app.stage.addChild(battleView.root);

  const fitStage = (): void => {
    const scale = Math.min(app.screen.width / WORLD_W, app.screen.height / WORLD_H);
    worldView.root.scale.set(scale);
    worldView.root.x = (app.screen.width - WORLD_W * scale) / 2;
    worldView.root.y = (app.screen.height - WORLD_H * scale) / 2;
    battleView.root.x = (app.screen.width - battleView.panelWidth) / 2;
    battleView.root.y = Math.max(10, (app.screen.height - battleView.panelHeight) / 2);
  };
  fitStage();
  app.renderer.on("resize", fitStage);

  // ---- 実況ログ ----
  const logBox = el<HTMLDivElement>("log");
  const pushLog = (tick: number, kind: string, text: string): void => {
    const line = document.createElement("div");
    line.className = `line ${logClassOf(kind)}`;
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = `${names.yearLabel(yearOf(tick))}${names.monthLabel(monthOf(tick))}`;
    line.appendChild(when);
    line.appendChild(document.createTextNode(` ${text}`));
    logBox.prepend(line);
    while (logBox.childElementCount > LOG_LIMIT) {
      logBox.lastElementChild?.remove();
    }
  };

  // ---- 上部の情勢帯 ----
  const dateEl = el<HTMLSpanElement>("date");
  const chipsEl = el<HTMLDivElement>("chips");
  const popEl = el<HTMLSpanElement>("pop");
  const refreshHeader = (): void => {
    dateEl.textContent = `${names.yearLabel(yearOf(world.tick))} ${names.monthLabel(monthOf(world.tick))}`;
    popEl.textContent = `存命武将 ${livingOfficers(world).length}名`;
    chipsEl.replaceChildren();
    for (const faction of world.factions.values()) {
      if (faction.fallenTick !== undefined) {
        continue;
      }
      const chip = document.createElement("span");
      chip.className = "chip";
      const swatch = document.createElement("i");
      swatch.style.background = `#${factionColor(faction.id).toString(16).padStart(6, "0")}`;
      chip.appendChild(swatch);
      const label =
        faction.cities.length > 0
          ? `${names.faction(faction.id)}　城${faction.cities.length}・将${faction.members.length}`
          : `${names.faction(faction.id)}（放浪）将${faction.members.length}`;
      chip.appendChild(document.createTextNode(label));
      chipsEl.appendChild(chip);
    }
  };

  // ---- 月次tickと演出の結線 ----
  const battleQueue: BattleReplay[] = [];
  const monthMs = (): number => BASE_MONTH_MS / speed;
  let paused = false;
  let speed = 1;
  let acc = 0;

  const mapFx = (event: WorldEvent): void => {
    if (event.loc === undefined) {
      return;
    }
    switch (event.kind) {
      case "war.plunder":
      case "war.raze":
        worldView.fire(event.loc);
        break;
      case "war.city-fall":
        worldView.pulse(event.loc, 0xffd76a);
        break;
      case "war.battle":
        worldView.pulse(event.loc, 0xff4433);
        break;
      case "life.execute":
      case "life.revenge":
        worldView.pulse(event.loc, 0xcc2222);
        break;
      case "faction.lair":
      case "faction.found":
      case "faction.rise":
        worldView.pulse(event.loc, 0x7ddc8f);
        break;
      case "life.oath":
        worldView.pulse(event.loc, 0xf0c96a);
        break;
      case "agit.disaster":
        worldView.pulse(event.loc, 0x9aa7b5);
        break;
      case "life.rescue-convoy":
      case "life.jailbreak":
        worldView.pulse(event.loc, 0xff9a3d);
        break;
      default:
        break;
    }
  };

  const step = (): void => {
    const prevLocs = new Map<string, string>();
    for (const officer of world.officers.values()) {
      prevLocs.set(officer.id, officer.loc);
    }
    const evStart = world.events.length;
    const rpStart = world.replays.length;

    stepMonth(world, names);

    for (const event of world.events.slice(evStart)) {
      eventIndex.set(event.id, event);
      mapFx(event);
      // 盤面内の細かな現象(clash.*)は合戦再生側で語られる。初対面(life.meet)は多すぎるため地図の光のみ
      if (!event.kind.startsWith("clash.") && event.kind !== "life.meet") {
        pushLog(event.tick, event.kind, narrateEvent(event, names));
      }
    }
    for (const replay of world.replays.slice(rpStart)) {
      battleQueue.push(replay);
    }
    worldView.applyTick(prevLocs, monthMs());
    refreshHeader();
  };

  // ---- 操作(最小限): 一時停止と速度 ----
  const pauseBtn = el<HTMLButtonElement>("btn-pause");
  const renderSpeed = (): void => {
    el<HTMLSpanElement>("speed").textContent = `×${speed}`;
    pauseBtn.textContent = paused ? "▶ 再開" : "⏸ 停止";
  };
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    renderSpeed();
  });
  el<HTMLButtonElement>("btn-slow").addEventListener("click", () => {
    speed = Math.max(0.5, speed / 2);
    renderSpeed();
  });
  el<HTMLButtonElement>("btn-fast").addEventListener("click", () => {
    speed = Math.min(8, speed * 2);
    renderSpeed();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      paused = !paused;
      renderSpeed();
      event.preventDefault();
    }
  });
  renderSpeed();

  pushLog(0, "plain", `世界が動き出す（シード ${seed}）。URLに ?seed=数字 を付けると別の歴史が生まれる。`);
  refreshHeader();

  app.ticker.add((ticker) => {
    const dms = ticker.deltaMS;
    worldView.update(dms);
    battleView.update(dms);

    // 合戦中は世界の時が止まり、盤面へ視線が移る
    if (battleView.playing) {
      return;
    }
    const nextBattle = battleQueue.shift();
    if (nextBattle !== undefined) {
      fitStage();
      battleView.setSpeed(() => speed);
      battleView.play(nextBattle, () => undefined);
      return;
    }
    if (paused) {
      return;
    }
    acc += dms;
    if (acc >= monthMs()) {
      acc = 0;
      step();
    }
  });
}

void boot();

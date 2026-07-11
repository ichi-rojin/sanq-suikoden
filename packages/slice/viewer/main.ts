// 責務: Viewerの合成根。ブラウザ内でシミュレーションを回し、タイル地形・自由カメラ・マップ上合戦・情報パネル群へ結線する
import { Application, Container, Sprite, Texture } from "pixi.js";
import { OFFICER_SEEDS } from "../data/officers.data";
import { createNameRegistry, narrateEvent, storyTitle } from "../data/text.data";
import {
  COAST_POINTS,
  DESERT_POINTS,
  EDGE_SEEDS,
  EXILE_DESTINATION,
  FACTION_SEEDS,
  GEO_FEATURES,
  GRID_H,
  GRID_W,
  PLACE_SEEDS,
} from "../data/world.data";
import { compileStories } from "../src/chronicle";
import type { Story } from "../src/chronicle";
import type { BattleReplay, Officer, World, WorldEvent } from "../src/model";
import { livingOfficers, monthOf, yearOf } from "../src/model";
import { buildWorld, stepMonth } from "../src/sim";
import { BattleMapView } from "./battle-view";
import { buildTerrain } from "./terrain";
import { CELL, SKILL_POP, factionColor, logClassOf } from "./theme";
import { WorldView } from "./world-view";

const BASE_MONTH_MS = 2600;
const LOG_LIMIT = 160;
const WORLD_PX_W = GRID_W * CELL;
const WORLD_PX_H = GRID_H * CELL;

// 合戦ログへ流す盤上の現象
const CLASH_LOGGED = new Set([
  "clash.stray", "clash.fire", "clash.sorcery", "clash.rockfall", "clash.duel",
  "clash.duel-respect", "clash.rescue", "clash.fall", "clash.capture", "clash.drown", "clash.taunt",
]);

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`#${id} not found`);
  }
  return node as T;
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get("seed") ?? "7");
  const initialZoom = Number(params.get("z") ?? "1");
  const jumpParam = params.get("jump");

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
  await app.init({ resizeTo: stage, background: 0x152a40, antialias: true });
  stage.appendChild(app.canvas);

  // ---- 世界レイヤ（地形→実体→合戦） ----
  const terrain = buildTerrain(GRID_W, GRID_H, PLACE_SEEDS, EDGE_SEEDS, GEO_FEATURES, COAST_POINTS, DESERT_POINTS);
  const worldRoot = new Container();
  worldRoot.addChild(new Sprite(Texture.from(terrain.canvas)));
  const worldView = new WorldView(world, names, terrain.roadPaths);
  worldRoot.addChild(worldView.root);
  const battleView = new BattleMapView(names);
  battleView.connectEvents(eventOf);
  worldRoot.addChild(battleView.root);
  app.stage.addChild(worldRoot);

  // ---- カメラ（自由スクロール・ズーム・追跡） ----
  const kaifengSeed = PLACE_SEEDS.find((p) => p.id === "kaifeng");
  const camera = {
    x: (kaifengSeed?.gridX ?? GRID_W / 2) * CELL,
    y: (kaifengSeed?.gridY ?? GRID_H / 2) * CELL,
    zoom: initialZoom,
    targetZoom: initialZoom,
  };
  let follow: { kind: "officer" | "place" | "army" | "battle"; id: string } | undefined;
  let autoBattleJump = jumpParam !== "0";

  const applyCamera = (): void => {
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.12;
    camera.x = Math.max(0, Math.min(WORLD_PX_W, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_PX_H, camera.y));
    worldRoot.scale.set(camera.zoom);
    worldRoot.x = app.screen.width / 2 - camera.x * camera.zoom;
    worldRoot.y = app.screen.height / 2 - camera.y * camera.zoom;
    worldView.setZoom(camera.zoom);
    battleView.setZoom(camera.zoom);
  };

  // ドラッグでスクロール（実体クリックと区別するため移動量で判定）
  let dragging = false;
  let dragMoved = 0;
  let lastPointer = { x: 0, y: 0 };
  app.canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    dragMoved = 0;
    lastPointer = { x: ev.clientX, y: ev.clientY };
  });
  window.addEventListener("pointermove", (ev) => {
    if (!dragging) {
      return;
    }
    const dx = ev.clientX - lastPointer.x;
    const dy = ev.clientY - lastPointer.y;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 6) {
      follow = undefined;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
    }
    lastPointer = { x: ev.clientX, y: ev.clientY };
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
  });
  app.canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    camera.targetZoom = Math.max(0.45, Math.min(4, camera.targetZoom * factor));
  }, { passive: false });
  window.addEventListener("keydown", (ev) => {
    const step = 60 / camera.zoom;
    if (ev.code === "ArrowUp") camera.y -= step;
    if (ev.code === "ArrowDown") camera.y += step;
    if (ev.code === "ArrowLeft") camera.x -= step;
    if (ev.code === "ArrowRight") camera.x += step;
    if (ev.code === "Space") {
      paused = !paused;
      renderSpeed();
      ev.preventDefault();
    }
  });

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

  // ---- 大事件トースト ----
  const toastBox = el<HTMLDivElement>("toasts");
  const showToast = (text: string, cls = ""): void => {
    const toast = document.createElement("div");
    toast.className = `toast ${cls}`;
    toast.textContent = text;
    toastBox.appendChild(toast);
    window.setTimeout(() => toast.remove(), 6500);
    while (toastBox.childElementCount > 4) {
      toastBox.firstElementChild?.remove();
    }
  };

  // ---- 左パネル: 勢力・戦況・物語 ----
  const factionsBox = el<HTMLDivElement>("factions");
  const warsBox = el<HTMLDivElement>("wars");
  const storiesBox = el<HTMLDivElement>("stories");
  const refreshFactions = (): void => {
    factionsBox.replaceChildren();
    const list = [...world.factions.values()]
      .filter((f) => f.fallenTick === undefined)
      .sort((a, b) => b.cities.length - a.cities.length);
    for (const faction of list) {
      const row = document.createElement("div");
      row.className = "frow";
      const sw = document.createElement("i");
      sw.style.background = colorHex(factionColor(faction.id));
      row.appendChild(sw);
      const label = document.createElement("span");
      label.textContent =
        faction.cities.length > 0
          ? `${names.faction(faction.id)}　城${faction.cities.length}・将${faction.members.length}`
          : `${names.faction(faction.id)}（放浪）将${faction.members.length}`;
      row.appendChild(label);
      factionsBox.appendChild(row);
    }
  };
  const refreshWars = (): void => {
    warsBox.replaceChildren();
    if (world.armies.length === 0 && !battleView.playing) {
      const idle = document.createElement("div");
      idle.className = "dim";
      idle.textContent = "諸勢力、兵を動かさず";
      warsBox.appendChild(idle);
      return;
    }
    for (const army of world.armies) {
      const row = document.createElement("div");
      row.className = "wrow";
      row.textContent = `${names.faction(army.factionId)}軍${army.troops}、${names.place(army.target)}へ行軍中`;
      row.style.borderLeftColor = colorHex(factionColor(army.factionId));
      warsBox.appendChild(row);
    }
    if (battleView.playing) {
      const row = document.createElement("div");
      row.className = "wrow fighting";
      row.textContent = "交戦中──";
      warsBox.appendChild(row);
    }
  };
  const knownStories = new Set<string>();
  let storyBooted = false;
  const refreshStories = (): void => {
    const stories = compileStories(world, { reweigh: false }).slice(0, 40);
    const fresh: Story[] = [];
    for (const story of stories) {
      const key = `${story.kind}:${story.coreId}`;
      if (!knownStories.has(key)) {
        knownStories.add(key);
        fresh.push(story);
      }
    }
    if (storyBooted) {
      for (const story of fresh.slice(0, 3)) {
        showToast(`物語が編まれた 『${titleOf(story)}』`, "story");
      }
    }
    storyBooted = true;
    storiesBox.replaceChildren();
    for (const story of stories.slice(0, 8)) {
      const row = document.createElement("div");
      row.className = "srow";
      row.textContent = `『${titleOf(story)}』`;
      storiesBox.appendChild(row);
    }
  };
  const titleOf = (story: Story): string =>
    storyTitle(story.kind, {
      index: story.index,
      ...(story.placeId !== undefined ? { placeName: names.place(story.placeId) } : {}),
      ...(story.officerId !== undefined ? { officerName: names.officer(story.officerId) } : {}),
      ...(story.officerId2 !== undefined ? { officerName2: names.officer(story.officerId2) } : {}),
      ...(story.factionId !== undefined ? { factionName: names.faction(story.factionId) } : {}),
    });

  // ---- 選択情報（都市・武将・軍） ----
  const infoBox = el<HTMLDivElement>("info");
  let selected: { kind: "officer" | "place" | "army"; id: string } | undefined;
  const describeOfficer = (officer: Officer): string[] => {
    const lines: string[] = [];
    const faction = officer.factionId !== undefined ? names.faction(officer.factionId) : "無所属";
    const statusLabel =
      officer.status === "serving" ? "仕官" : officer.status === "prisoner" ? "囚" :
      officer.status === "dead" ? "故人" : "放浪";
    lines.push(`${faction}／${statusLabel}／${officer.age}歳　今: ${names.place(officer.loc)}`);
    const a = officer.aptitudes;
    lines.push(`武${Math.round(a.valor)} 知${Math.round(a.intellect)} 統${Math.round(a.leadership)} 魅${Math.round(a.charisma)} 術${Math.round(a.craft)}`);
    const sworn = [...officer.rel.entries()].filter(([, r]) => r.bond === "sworn").map(([id]) => names.officerShort(id));
    if (sworn.length > 0) {
      lines.push(`義兄弟: ${sworn.join("、")}`);
    }
    const grudges = [...officer.rel.entries()].filter(([, r]) => r.grudges.length > 0);
    if (grudges.length > 0) {
      lines.push(`怨恨: ${grudges.map(([id]) => names.officerShort(id)).join("、")}`);
    }
    const recent = officer.memory.slice(-3).map((id) => eventOf(id)).filter((e): e is WorldEvent => e !== undefined);
    for (const event of recent) {
      lines.push(`・${narrateEvent(event, names)}`);
    }
    return lines;
  };
  const renderInfo = (): void => {
    infoBox.replaceChildren();
    if (selected === undefined) {
      const hint = document.createElement("div");
      hint.className = "dim";
      hint.textContent = "都市・武将・軍旗を選ぶと仔細を表示（ドラッグ移動／ホイール拡縮）";
      infoBox.appendChild(hint);
      return;
    }
    const title = document.createElement("div");
    title.className = "info-title";
    const body = document.createElement("div");
    body.className = "info-body";
    if (selected.kind === "officer") {
      const officer = world.officers.get(selected.id);
      if (officer === undefined) {
        return;
      }
      title.textContent = names.officer(officer.id);
      for (const line of describeOfficer(officer)) {
        const div = document.createElement("div");
        div.textContent = line;
        body.appendChild(div);
      }
    } else if (selected.kind === "place") {
      const place = world.places.get(selected.id);
      if (place === undefined) {
        return;
      }
      title.textContent = names.place(place.id);
      const owner = place.owner !== undefined ? names.faction(place.owner) : "主なし";
      const rows = [
        `${owner}　兵${Math.floor(place.garrison)}　民心${Math.floor(place.sentiment)}　富${Math.floor(place.wealth)}${place.devastation >= 5 ? `　戦禍${Math.floor(place.devastation)}` : ""}`,
      ];
      const here = livingOfficers(world).filter((o) => o.loc === place.id && o.status !== "prisoner");
      if (here.length > 0) {
        rows.push(`在: ${here.slice(0, 10).map((o) => names.officerShort(o.id)).join("、")}${here.length > 10 ? " 他" : ""}`);
      }
      for (const line of rows) {
        const div = document.createElement("div");
        div.textContent = line;
        body.appendChild(div);
      }
    } else {
      const army = world.armies.find((a) => a.id === selected?.id);
      if (army === undefined) {
        infoBox.replaceChildren();
        return;
      }
      title.textContent = `${names.faction(army.factionId)}軍`;
      const div = document.createElement("div");
      div.textContent = `兵${army.troops}　${names.place(army.target)}へ進軍中　将: ${army.officers.map((o) => names.officerShort(o)).join("、")}`;
      body.appendChild(div);
    }
    const followBtn = document.createElement("button");
    followBtn.textContent = "追跡";
    followBtn.addEventListener("click", () => {
      if (selected !== undefined) {
        follow = { ...selected };
        camera.targetZoom = Math.max(camera.targetZoom, 1.6);
      }
    });
    title.appendChild(followBtn);
    infoBox.appendChild(title);
    infoBox.appendChild(body);
  };
  worldView.onSelect = (kind, id) => {
    if (dragMoved > 6) {
      return;
    }
    selected = { kind, id };
    renderInfo();
  };

  // ---- 上部の情勢帯 ----
  const dateEl = el<HTMLSpanElement>("date");
  const popEl = el<HTMLSpanElement>("pop");
  const refreshHeader = (): void => {
    dateEl.textContent = `${names.yearLabel(yearOf(world.tick))} ${names.monthLabel(monthOf(world.tick))}`;
    popEl.textContent = `存命武将 ${livingOfficers(world).length}名`;
  };

  // ---- 合戦の現象 → ポップとログ ----
  battleView.onFrameEvent = (event, x, y) => {
    const pop = SKILL_POP[event.kind];
    if (pop !== undefined) {
      worldView.floatText(x + (Math.abs(event.id.length * 7) % 40) - 20, y - 30, pop.label, pop.color);
    }
    if (CLASH_LOGGED.has(event.kind)) {
      pushLog(event.tick, event.kind, narrateEvent(event, names));
    }
  };

  // ---- 月次tick ----
  const battleQueue: BattleReplay[] = [];
  let paused = false;
  let speed = 1;
  let acc = 0;
  const monthMs = (): number => BASE_MONTH_MS / speed;

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

  const bigNews = (event: WorldEvent): void => {
    switch (event.kind) {
      case "faction.rise":
        showToast(`${names.faction(event.factions[0] ?? "", event.tick)}、城市を奪って天下に名乗る!`, "rise");
        break;
      case "faction.fall":
        showToast(`${names.faction(event.factions[0] ?? "", event.tick)}、根拠を失い放浪軍となる`, "fall");
        break;
      case "faction.lair":
        showToast(`${names.faction(event.factions[0] ?? "", event.tick)}、${event.loc !== undefined ? names.place(event.loc) : ""}に山寨を開く`, "rise");
        break;
      case "war.city-fall":
        showToast(`${event.loc !== undefined ? names.place(event.loc) : ""} 陥落`, "fall");
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
    worldView.armyPrevLocs(prevLocs);
    const evStart = world.events.length;
    const rpStart = world.replays.length;

    stepMonth(world, names);

    for (const event of world.events.slice(evStart)) {
      eventIndex.set(event.id, event);
      mapFx(event);
      bigNews(event);
      // 初対面と小宴は地図の光のみ（ログの主役は事件）
      const smallFeast = event.kind === "life.feast" && event.actors.length < 4;
      if (!event.kind.startsWith("clash.") && event.kind !== "life.meet" && !smallFeast) {
        pushLog(event.tick, event.kind, narrateEvent(event, names));
      }
    }
    for (const replay of world.replays.slice(rpStart)) {
      battleQueue.push(replay);
    }
    worldView.applyTick(prevLocs, monthMs());
    refreshHeader();
    refreshFactions();
    refreshWars();
    if (world.tick % 6 === 0) {
      refreshStories();
    }
    if (selected !== undefined) {
      renderInfo();
    }
  };

  // ---- 操作 ----
  const pauseBtn = el<HTMLButtonElement>("btn-pause");
  const renderSpeed = (): void => {
    el<HTMLSpanElement>("speed").textContent = `×${speed}`;
    pauseBtn.textContent = paused ? "▶ 再開" : "⏸ 停止";
    el<HTMLButtonElement>("btn-jump").textContent = autoBattleJump ? "戦場追跡: 入" : "戦場追跡: 切";
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
  el<HTMLButtonElement>("btn-jump").addEventListener("click", () => {
    autoBattleJump = !autoBattleJump;
    renderSpeed();
  });
  el<HTMLButtonElement>("btn-home").addEventListener("click", () => {
    follow = undefined;
    camera.x = (kaifengSeed?.gridX ?? 0) * CELL;
    camera.y = (kaifengSeed?.gridY ?? 0) * CELL;
    camera.targetZoom = 1.0;
  });
  renderSpeed();

  pushLog(0, "plain", `天下は北宋の末。世界が動き出す（シード ${seed}。?seed=数字 で別の歴史）`);
  refreshHeader();
  refreshFactions();
  refreshWars();
  renderInfo();
  applyCamera();

  // ---- 主ループ ----
  app.ticker.add((ticker) => {
    const dms = ticker.deltaMS;
    worldView.update(dms);
    battleView.update(dms, monthMs());

    // 合戦の開幕: キューから盤面へ
    const nextBattle = battleQueue.shift();
    if (nextBattle !== undefined) {
      const at = worldView.pos(nextBattle.loc);
      battleView.play(nextBattle, at.x, at.y);
      worldView.pulse(nextBattle.loc, 0xff4433);
      if (autoBattleJump) {
        follow = { kind: "battle", id: nextBattle.id };
        camera.targetZoom = Math.max(1.5, camera.targetZoom);
      }
    }

    // 追跡カメラ
    if (follow !== undefined) {
      const pos =
        follow.kind === "battle"
          ? battleView.primaryPosition()
          : worldView.entityPosition(follow.kind, follow.id);
      if (pos !== undefined) {
        camera.x += (pos.x - camera.x) * 0.08;
        camera.y += (pos.y - camera.y) * 0.08;
      } else if (follow.kind === "battle" && !battleView.playing) {
        follow = undefined;
      }
    }
    applyCamera();

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

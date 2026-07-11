// 責務: Viewerの合成根。ブラウザ内で日次シミュレーションを回し、タイル世界・自由カメラ・世界戦場・小窓ドラマ・情報パネル群へ結線する
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
import { collectDramas } from "../src/drama";
import type { Officer, World, WorldEvent } from "../src/model";
import { armyTroops, dayOf, livingOfficers, monthOf, placePos, yearOf } from "../src/model";
import { buildWorld, stepDay } from "../src/sim";
import { DramaView } from "./drama-view";
import { buildTerrainLayer } from "./terrain";
import { CELL, SKILL_POP, factionColor, logClassOf } from "./theme";
import { WorldView } from "./world-view";

const BASE_DAY_MS = 300; // ×1速度の1日。1ヶ月≒9秒（SAN9の旬進行の距離感）
const LOG_LIMIT = 160;
const WORLD_PX_W = GRID_W * CELL;
const WORLD_PX_H = GRID_H * CELL;

// 実況ログへ流す盤上の現象
const CLASH_LOGGED = new Set([
  "clash.stray", "clash.fire", "clash.sorcery", "clash.rockfall", "clash.duel",
  "clash.duel-respect", "clash.rescue", "clash.fall", "clash.capture", "clash.drown", "clash.taunt",
  "clash.ambush",
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
  const initialSpeed = Number(params.get("speed") ?? "1");

  const names = createNameRegistry(OFFICER_SEEDS, FACTION_SEEDS, PLACE_SEEDS);
  const world: World = buildWorld(seed, {
    gridW: GRID_W,
    gridH: GRID_H,
    officers: OFFICER_SEEDS,
    factions: FACTION_SEEDS,
    places: PLACE_SEEDS,
    edges: EDGE_SEEDS,
    geo: GEO_FEATURES,
    coast: COAST_POINTS,
    desert: DESERT_POINTS,
    exileDest: EXILE_DESTINATION,
  });
  const eventIndex = new Map<string, WorldEvent>();
  const eventOf = (id: string): WorldEvent | undefined => eventIndex.get(id);

  const stage = el<HTMLDivElement>("stage");
  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x152a40, antialias: true });
  stage.appendChild(app.canvas);

  // ---- 世界レイヤ（地形→実体） ----
  const terrain = buildTerrainLayer(world);
  const worldRoot = new Container();
  const terrainTexture = Texture.from(terrain.canvas);
  worldRoot.addChild(new Sprite(terrainTexture));
  const worldView = new WorldView(world, names);
  worldRoot.addChild(worldView.root);
  app.stage.addChild(worldRoot);

  // ---- 小窓ドラマ（世界は止めない。カメラが寄るだけ） ----
  const dramaView = new DramaView(el<HTMLDivElement>("drama"), names);

  // ---- カメラ（自由スクロール・ズーム・追跡） ----
  const kaifengSeed = PLACE_SEEDS.find((p) => p.id === "kaifeng");
  const camera = {
    x: (kaifengSeed?.gridX ?? GRID_W / 2) * CELL + CELL / 2,
    y: (kaifengSeed?.gridY ?? GRID_H / 2) * CELL + CELL / 2,
    zoom: initialZoom,
    targetZoom: initialZoom,
  };
  let follow: { kind: "officer" | "place" | "army" | "battle"; id: string } | undefined;
  let autoBattleJump = jumpParam !== "0";

  dramaView.onFocus = (x, y) => {
    follow = undefined;
    camera.x = x * CELL + CELL / 2;
    camera.y = y * CELL + CELL / 2;
    camera.targetZoom = Math.max(camera.targetZoom, 1.8);
  };

  const applyCamera = (): void => {
    camera.zoom += (camera.targetZoom - camera.zoom) * 0.12;
    camera.x = Math.max(0, Math.min(WORLD_PX_W, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_PX_H, camera.y));
    worldRoot.scale.set(camera.zoom);
    worldRoot.x = app.screen.width / 2 - camera.x * camera.zoom;
    worldRoot.y = app.screen.height / 2 - camera.y * camera.zoom;
    worldView.setZoom(camera.zoom);
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

  // ---- レーダーマップ（SAN9の常時ミニマップ。勢力色の拠点・軍・戦場とカメラ枠、クリックでジャンプ） ----
  const minimap = el<HTMLCanvasElement>("minimap");
  const MM = 176;
  minimap.width = MM;
  minimap.height = Math.round((MM * WORLD_PX_H) / WORLD_PX_W);
  const mmCtx = minimap.getContext("2d");
  const mmScale = MM / WORLD_PX_W;
  const renderMinimap = (): void => {
    if (mmCtx === null) {
      return;
    }
    mmCtx.drawImage(terrain.canvas, 0, 0, minimap.width, minimap.height);
    for (const place of world.places.values()) {
      if (place.kind === "pass" || place.kind === "port") {
        continue;
      }
      mmCtx.fillStyle = colorHex(factionColor(place.owner));
      const size = place.kind === "capital" ? 4 : 3;
      mmCtx.fillRect((place.gridX + 0.5) * CELL * mmScale - size / 2, (place.gridY + 0.5) * CELL * mmScale - size / 2, size, size);
    }
    mmCtx.fillStyle = "#ffffff";
    for (const army of world.armies) {
      mmCtx.fillRect((army.x + 0.5) * CELL * mmScale - 1, (army.y + 0.5) * CELL * mmScale - 1, 2, 2);
    }
    mmCtx.fillStyle = "#ff5544";
    for (const battle of world.battles) {
      mmCtx.fillRect((battle.x + 0.5) * CELL * mmScale - 1.5, (battle.y + 0.5) * CELL * mmScale - 1.5, 3, 3);
    }
    // 現在のカメラ視界
    const vw = (app.screen.width / camera.zoom) * mmScale;
    const vh = (app.screen.height / camera.zoom) * mmScale;
    mmCtx.strokeStyle = "rgba(240,230,210,0.85)";
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(camera.x * mmScale - vw / 2, camera.y * mmScale - vh / 2, vw, vh);
  };
  minimap.addEventListener("pointerdown", (ev) => {
    const rect = minimap.getBoundingClientRect();
    follow = undefined;
    camera.x = ((ev.clientX - rect.left) / rect.width) * WORLD_PX_W;
    camera.y = ((ev.clientY - rect.top) / rect.height) * WORLD_PX_H;
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
    if (world.armies.length === 0 && world.battles.length === 0) {
      const idle = document.createElement("div");
      idle.className = "dim";
      idle.textContent = "諸勢力、兵を動かさず";
      warsBox.appendChild(idle);
      return;
    }
    for (const battle of world.battles) {
      const row = document.createElement("div");
      row.className = "wrow fighting";
      const who = battle.factions.map((f) => names.faction(f)).join(" × ");
      row.textContent = battle.placeId !== undefined
        ? `攻城戦 ${names.place(battle.placeId)}──${who}`
        : `野戦──${who}`;
      warsBox.appendChild(row);
    }
    for (const army of world.armies) {
      if (army.battleId !== undefined || army.state === "fight") {
        continue;
      }
      const row = document.createElement("div");
      row.className = "wrow";
      row.textContent = `${names.faction(army.factionId)}軍${armyTroops(army)}、${names.place(army.target)}へ行軍中`;
      row.style.borderLeftColor = colorHex(factionColor(army.factionId));
      warsBox.appendChild(row);
    }
  };
  // ---- 物語リーダー（物語書架をクリックすると開く。世界は止めない） ----
  const storyModal = el<HTMLDivElement>("story-modal");
  const storyTitleEl = storyModal.querySelector(".story-title") as HTMLElement;
  const storyBodyEl = storyModal.querySelector(".story-body") as HTMLElement;
  const closeStory = (): void => storyModal.classList.add("hidden");
  storyModal.querySelector(".story-close")?.addEventListener("click", closeStory);
  storyModal.addEventListener("pointerdown", (ev) => {
    if (ev.target === storyModal) {
      closeStory();
    }
  });
  const openStory = (story: Story): void => {
    storyTitleEl.textContent = `『${titleOf(story)}』`;
    storyBodyEl.replaceChildren();
    for (const event of story.events) {
      const row = document.createElement("div");
      row.className = "story-line";
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = `${names.yearLabel(yearOf(event.tick))}${names.monthLabel(monthOf(event.tick))}`;
      row.appendChild(when);
      row.appendChild(document.createTextNode(narrateEvent(event, names)));
      storyBodyEl.appendChild(row);
    }
    storyModal.classList.remove("hidden");
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
      row.addEventListener("click", () => openStory(story));
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
    const where = officer.journey !== undefined
      ? `${names.place(officer.journey.dest)}へ旅の途上`
      : names.place(officer.loc);
    lines.push(`${faction}／${statusLabel}／${officer.age}歳　今: ${where}`);
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
        `${owner}　兵${Math.floor(place.garrison)}　民心${Math.floor(place.sentiment)}　富${Math.floor(place.wealth)}${place.devastation >= 5 ? `　戦禍${Math.floor(place.devastation)}` : ""}${place.gateBroken ? "　城門破壊" : ""}`,
      ];
      const here = livingOfficers(world).filter((o) => o.loc === place.id && o.journey === undefined && o.status !== "prisoner");
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
      const doing = army.battleId !== undefined || army.state === "fight" ? "交戦中" : `${names.place(army.target)}へ進軍中`;
      div.textContent = `兵${armyTroops(army)}　${doing}　将: ${army.units.map((u) => names.officerShort(u.officerId)).join("、")}`;
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
    const day = dayOf(world.tick);
    const phase = day <= 10 ? "上旬" : day <= 20 ? "中旬" : "下旬";
    dateEl.textContent = `${names.yearLabel(yearOf(world.tick))} ${names.monthLabel(monthOf(world.tick))}${phase}`;
    popEl.textContent = `存命武将 ${livingOfficers(world).length}名　燃焼${world.grid.fires.size}地`;
  };

  // ---- 日次tick ----
  let paused = false;
  let speed = Math.max(0.5, Math.min(8, initialSpeed));
  let acc = 0;
  const dayMs = (): number => BASE_DAY_MS / speed;

  const eventAtPx = (event: WorldEvent): { x: number; y: number } | undefined => {
    if (event.at !== undefined) {
      return { x: event.at.x * CELL + CELL / 2, y: event.at.y * CELL + CELL / 2 };
    }
    if (event.loc !== undefined) {
      const p = placePos(world, event.loc);
      return { x: p.x * CELL + CELL / 2, y: p.y * CELL + CELL / 2 };
    }
    return undefined;
  };

  const mapFx = (event: WorldEvent): void => {
    const at = event.at ?? (event.loc !== undefined ? placePos(world, event.loc) : undefined);
    if (at === undefined) {
      return;
    }
    switch (event.kind) {
      case "war.plunder":
      case "war.raze":
        worldView.fireBurstAt(at.x, at.y);
        break;
      case "war.city-fall":
        worldView.pulseAt(at.x, at.y, 0xffd76a);
        break;
      case "war.encounter":
      case "war.siege":
        worldView.pulseAt(at.x, at.y, 0xff4433);
        break;
      case "life.execute":
      case "life.revenge":
        worldView.pulseAt(at.x, at.y, 0xcc2222);
        break;
      case "faction.lair":
      case "faction.found":
      case "faction.rise":
        worldView.pulseAt(at.x, at.y, 0x7ddc8f);
        break;
      case "life.oath":
        worldView.pulseAt(at.x, at.y, 0xf0c96a);
        break;
      case "agit.disaster":
        worldView.pulseAt(at.x, at.y, 0x9aa7b5);
        break;
      case "life.rescue-convoy":
      case "life.jailbreak":
        worldView.pulseAt(at.x, at.y, 0xff9a3d);
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
      case "war.gate-breach":
        showToast(`${event.loc !== undefined ? names.place(event.loc) : ""}の城門が破られた!`, "fall");
        break;
      default:
        break;
    }
  };

  const step = (): void => {
    const evStart = world.events.length;
    stepDay(world, names);
    const newEvents = world.events.slice(evStart);
    const newDramas = collectDramas(world, newEvents);

    for (const event of newEvents) {
      eventIndex.set(event.id, event);
      mapFx(event);
      bigNews(event);
      // 兵法発動ポップ（SAN9の癖になる瞬間）
      const pop = SKILL_POP[event.kind];
      const px = eventAtPx(event);
      if (pop !== undefined && px !== undefined) {
        worldView.floatText(px.x + (Math.abs(event.id.length * 7) % 40) - 20, px.y - 14, pop.label, pop.color);
      }
      // ログ: 盤上の細かな現象は主要なものだけ、初対面と小宴は地図の光のみ
      const smallFeast = event.kind === "life.feast" && event.actors.length < 4;
      if (event.kind.startsWith("clash.")) {
        if (CLASH_LOGGED.has(event.kind)) {
          pushLog(event.tick, event.kind, narrateEvent(event, names));
        }
      } else if (event.kind !== "life.meet" && !smallFeast) {
        pushLog(event.tick, event.kind, narrateEvent(event, names));
      }
    }
    for (const drama of newDramas) {
      dramaView.enqueue(drama);
    }
    // 地形の傷（延焼跡・瓦礫・城門）を差分再描画
    if (world.grid.dirty.length > 0) {
      terrain.repaint(world.grid.dirty);
      world.grid.dirty.length = 0;
      terrainTexture.source.update();
    }
    worldView.applyTick(dayMs());
    refreshHeader();
    if (world.tick % 5 === 0) {
      refreshFactions();
      refreshWars();
    }
    if (world.tick % 60 === 0) {
      refreshStories();
    }
    if (selected !== undefined && world.tick % 5 === 0) {
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
    camera.x = (kaifengSeed?.gridX ?? 0) * CELL + CELL / 2;
    camera.y = (kaifengSeed?.gridY ?? 0) * CELL + CELL / 2;
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
  const knownBattles = new Set<string>();
  app.ticker.add((ticker) => {
    const dms = ticker.deltaMS;
    worldView.update(dms);
    dramaView.update(dms);

    // 新しい戦場が開いたら追跡カメラを寄せる
    for (const battle of world.battles) {
      if (!knownBattles.has(battle.id)) {
        knownBattles.add(battle.id);
        if (autoBattleJump) {
          follow = { kind: "battle", id: battle.id };
          camera.targetZoom = Math.max(1.5, camera.targetZoom);
        }
      }
    }

    // 追跡カメラ
    if (follow !== undefined) {
      const pos = worldView.entityPosition(follow.kind, follow.id);
      if (pos !== undefined) {
        camera.x += (pos.x - camera.x) * 0.08;
        camera.y += (pos.y - camera.y) * 0.08;
      } else if (follow.kind === "battle") {
        follow = undefined;
      }
    }
    applyCamera();
    renderMinimap();

    if (paused) {
      return;
    }
    acc += dms;
    let burst = 0;
    while (acc >= dayMs() && burst < 4) {
      acc -= dayMs();
      burst += 1;
      step();
    }
    if (burst >= 4) {
      acc = 0; // 追い付けない分は切り捨てる（描画を犠牲にしない）
    }
  });
}

void boot();

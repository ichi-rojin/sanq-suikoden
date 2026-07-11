// 責務: 観測系の中核。イベントの因果チェーンから物語パッケージを自動編纂し、編年史・列伝の原稿を作る
import { reweighByCitation } from "./events";
import type { EventId, OfficerId, World, WorldEvent } from "./model";
import { livingOfficers, yearOf } from "./model";

export type StoryKind = "war" | "outlaw" | "oath" | "revenge" | "rise" | "collapse" | "duel";

export interface Story {
  kind: StoryKind;
  index: number;
  coreId: string; // 核イベントID（Viewerが新着通知の同一性判定に使う）
  events: WorldEvent[];
  actors: OfficerId[];
  placeId?: string;
  factionId?: string;
  officerId?: string;
  officerId2?: string;
  startTick: number;
  endTick: number;
  weight: number;
}

interface EventIndex {
  byId: Map<EventId, WorldEvent>;
  children: Map<EventId, WorldEvent[]>;
}

function buildIndex(world: World): EventIndex {
  const byId = new Map<EventId, WorldEvent>();
  const children = new Map<EventId, WorldEvent[]>();
  for (const event of world.events) {
    byId.set(event.id, event);
  }
  for (const event of world.events) {
    for (const cause of event.causes) {
      const list = children.get(cause) ?? [];
      list.push(event);
      children.set(cause, list);
    }
  }
  return { byId, children };
}

// 因果を遡って物語の前史を集める（誤射が十年後の復讐の第一章になる仕組み）
function ancestors(index: EventIndex, event: WorldEvent, maxDepth: number): WorldEvent[] {
  const collected = new Map<EventId, WorldEvent>();
  const walk = (e: WorldEvent, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    for (const causeId of e.causes) {
      const cause = index.byId.get(causeId);
      if (cause !== undefined && !collected.has(cause.id)) {
        collected.set(cause.id, cause);
        walk(cause, depth + 1);
      }
    }
  };
  walk(event, 0);
  return [...collected.values()];
}

// 因果を下って余波を集める
function descendants(index: EventIndex, event: WorldEvent, maxDepth: number): WorldEvent[] {
  const collected = new Map<EventId, WorldEvent>();
  const walk = (e: WorldEvent, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }
    for (const child of index.children.get(e.id) ?? []) {
      if (!collected.has(child.id)) {
        collected.set(child.id, child);
        walk(child, depth + 1);
      }
    }
  };
  walk(event, 0);
  return [...collected.values()];
}

// イベントIDの連番（同月内の出来事を発生順に並べるため）
function seqOf(event: WorldEvent): number {
  const raw = event.id.split("-")[1];
  return raw === undefined ? 0 : Number(raw);
}

function makeStory(kind: StoryKind, core: WorldEvent, events: WorldEvent[]): Story {
  const all = [...new Map(events.map((e) => [e.id, e])).values()].sort(
    (a, b) => a.tick - b.tick || seqOf(a) - seqOf(b),
  );
  const actors = [...new Set(all.flatMap((e) => e.actors))];
  const weight = all.reduce((sum, e) => sum + e.sig, 0);
  const first = all[0] ?? core;
  const last = all[all.length - 1] ?? core;
  return {
    kind,
    index: 0,
    coreId: core.id,
    events: all,
    actors,
    startTick: first.tick,
    endTick: last.tick,
    weight,
    ...(core.loc !== undefined ? { placeId: core.loc } : {}),
    ...(core.factions[0] !== undefined ? { factionId: core.factions[0] } : {}),
  };
}

export interface CompileOptions {
  reweigh?: boolean; // 因果引用による重み再計算（破壊的加算のためViewerの定期呼び出しでは切る）
}

export function compileStories(world: World, options?: CompileOptions): Story[] {
  if (options?.reweigh !== false) {
    reweighByCitation(world);
  }
  const index = buildIndex(world);
  const stories: Story[] = [];

  for (const event of world.events) {
    switch (event.kind) {
      case "war.declare": {
        const arc = descendants(index, event, 4);
        if (arc.some((e) => e.kind === "war.battle")) {
          const story = makeStory("war", event, [event, ...arc]);
          const target = typeof event.data["target"] === "string" ? (event.data["target"] as string) : event.loc;
          if (target !== undefined) {
            story.placeId = target;
          }
          stories.push(story);
        }
        break;
      }
      case "life.defect":
      case "life.rescue-convoy":
      case "life.jailbreak":
      case "life.desert": {
        const before = ancestors(index, event, 5);
        const after = descendants(index, event, 2).filter((e) => e.kind.startsWith("life.") || e.kind.startsWith("faction."));
        const story = makeStory("outlaw", event, [...before, event, ...after]);
        const hero =
          typeof event.data["officer"] === "string"
            ? (event.data["officer"] as string)
            : typeof event.data["prisoner"] === "string"
              ? (event.data["prisoner"] as string)
              : event.actors[0];
        if (hero !== undefined) {
          story.officerId = hero;
        }
        stories.push(story);
        break;
      }
      case "life.oath": {
        const before = ancestors(index, event, 3);
        const story = makeStory("oath", event, [...before, event]);
        story.officerId = event.actors[0] as string;
        if (event.actors[1] !== undefined) {
          story.officerId2 = event.actors[1];
        }
        stories.push(story);
        break;
      }
      case "life.revenge": {
        const before = ancestors(index, event, 6);
        const story = makeStory("revenge", event, [...before, event]);
        if (typeof event.data["avenger"] === "string") {
          story.officerId = event.data["avenger"] as string;
        }
        stories.push(story);
        break;
      }
      case "faction.rise":
      case "faction.lair":
      case "faction.found": {
        const before = ancestors(index, event, 3);
        const story = makeStory("rise", event, [...before, event]);
        story.factionId = event.factions[0] as string;
        stories.push(story);
        break;
      }
      case "faction.fall": {
        const before = ancestors(index, event, 3);
        const after = descendants(index, event, 2);
        const story = makeStory("collapse", event, [...before, event, ...after]);
        story.factionId = event.factions[0] as string;
        stories.push(story);
        break;
      }
      case "clash.duel-respect": {
        const story = makeStory("duel", event, [event]);
        story.officerId = event.actors[0] as string;
        if (event.actors[1] !== undefined) {
          story.officerId2 = event.actors[1];
        }
        stories.push(story);
        break;
      }
      default:
        break;
    }
  }

  const ranked = stories
    .filter((s) => s.events.length >= 2 || s.kind === "duel")
    .sort((a, b) => b.weight - a.weight);
  ranked.forEach((story, i) => {
    story.index = i;
  });
  return ranked;
}

export function annalsOf(world: World, minSig: number, capPerYear: number): Map<number, WorldEvent[]> {
  const byYear = new Map<number, WorldEvent[]>();
  for (const event of world.events) {
    if (event.sig < minSig) {
      continue;
    }
    const year = yearOf(event.tick);
    const list = byYear.get(year) ?? [];
    list.push(event);
    byYear.set(year, list);
  }
  for (const [year, list] of byYear) {
    byYear.set(
      year,
      list.sort((a, b) => a.tick - b.tick || seqOf(a) - seqOf(b)).slice(0, capPerYear),
    );
  }
  return byYear;
}

export function biographyOf(world: World, officerId: OfficerId): WorldEvent[] {
  const officer = world.officers.get(officerId);
  if (officer === undefined) {
    return [];
  }
  const byId = new Map(world.events.map((e) => [e.id, e]));
  const seen = new Set<EventId>();
  const result: WorldEvent[] = [];
  for (const id of officer.memory) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const event = byId.get(id);
    if (event !== undefined) {
      result.push(event);
    }
  }
  return result.sort((a, b) => a.tick - b.tick);
}

export interface RelationDigestEntry {
  a: OfficerId;
  b: OfficerId;
  affinity: number;
  bond: boolean;
  grudges: number;
}

export function relationDigest(world: World): {
  bonds: RelationDigestEntry[];
  grudges: RelationDigestEntry[];
} {
  const bonds: RelationDigestEntry[] = [];
  const grudges: RelationDigestEntry[] = [];
  const seen = new Set<string>();
  for (const officer of livingOfficers(world)) {
    for (const [targetId, rel] of officer.rel) {
      const target = world.officers.get(targetId);
      if (target === undefined) {
        continue;
      }
      const key = [officer.id, targetId].sort().join(":");
      if (rel.grudges.length > 0) {
        grudges.push({
          a: officer.id,
          b: targetId,
          affinity: rel.affinity,
          bond: false,
          grudges: rel.grudges.length,
        });
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const back = target.rel.get(officer.id);
      const mutual = rel.affinity + (back?.affinity ?? 0);
      if (mutual >= 110 || rel.bond === "sworn") {
        bonds.push({
          a: officer.id,
          b: targetId,
          affinity: mutual,
          bond: rel.bond !== undefined,
          grudges: 0,
        });
      }
    }
  }
  bonds.sort((x, y) => y.affinity - x.affinity);
  grudges.sort((x, y) => y.grudges - x.grudges || x.affinity - y.affinity);
  return { bonds: bonds.slice(0, 12), grudges: grudges.slice(0, 12) };
}

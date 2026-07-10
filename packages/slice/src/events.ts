// 責務: イベント生成の唯一の入口。全出来事へIDと因果(causes)と重みを付与し、当事者の記憶へ刻む
import type { EventId, FactionId, OfficerId, PlaceId, World, WorldEvent } from "./model";
import { nextId } from "./model";
import { applyEventEmotions } from "./relations";

// 編年史採録の基準重み。後続イベントの原因に引かれるたび加点される（因果保存の可視化）
const BASE_SIG: Record<string, number> = {
  "agit.disaster": 55,
  "agit.extortion": 45,
  "faction.crackdown": 50,
  "faction.found": 85,
  "faction.lair": 80,
  "faction.rise": 92,
  "faction.fall": 90,
  "faction.disband": 75,
  "faction.succession": 70,
  "faction.split": 78,
  "war.declare": 65,
  "war.battle": 75,
  "war.city-fall": 92,
  "war.repelled": 70,
  "war.plunder": 68,
  "war.raid": 55,
  "clash.charge": 30,
  "clash.knockback": 32,
  "clash.drown": 45,
  "clash.volley": 28,
  "clash.stray": 48,
  "clash.fire": 42,
  "clash.burn": 35,
  "clash.sorcery": 45,
  "clash.rockfall": 48,
  "clash.terrain": 40,
  "clash.ambush": 42,
  "clash.taunt": 38,
  "clash.duel": 55,
  "clash.duel-respect": 52,
  "clash.rescue": 46,
  "clash.rout": 25,
  "clash.fall": 80,
  "clash.capture": 60,
  "life.meet": 24,
  "life.feast": 24,
  "life.quarrel": 42,
  "life.oath": 62,
  "life.defect": 72,
  "life.desert": 76,
  "life.join": 55,
  "life.recruit": 50,
  "life.revenge": 74,
  "life.duel": 50,
  "life.frame": 66,
  "life.convoy": 48,
  "life.rescue-convoy": 78,
  "life.jailbreak": 76,
  "war.raze": 62,
  "life.prison": 45,
  "life.execute": 82,
  "life.release": 55,
  "life.illness-death": 60,
  "life.raid-travelers": 35,
};

export interface EmitInput {
  kind: string;
  loc?: PlaceId;
  actors?: OfficerId[];
  factions?: FactionId[];
  causes?: EventId[];
  data?: Record<string, unknown>;
  sig?: number;
}

const MEMORY_SIG_MIN = 28;

export function emit(world: World, input: EmitInput): WorldEvent {
  const event: WorldEvent = {
    id: nextId(world, "e"),
    tick: world.tick,
    kind: input.kind,
    actors: input.actors ?? [],
    factions: input.factions ?? [],
    causes: input.causes ?? [],
    data: input.data ?? {},
    sig: input.sig ?? BASE_SIG[input.kind] ?? 30,
    ...(input.loc !== undefined ? { loc: input.loc } : {}),
  };
  world.events.push(event);
  applyEventEmotions(world, event);
  if (event.sig >= MEMORY_SIG_MIN) {
    for (const actorId of event.actors) {
      const officer = world.officers.get(actorId);
      if (officer !== undefined) {
        officer.memory.push(event.id);
      }
    }
  }
  return event;
}

// 因果で引用されたイベントは歴史的重みを増す（誤射が十年後に意味を持つ仕組み）
export function reweighByCitation(world: World): void {
  const byId = new Map<EventId, WorldEvent>();
  for (const event of world.events) {
    byId.set(event.id, event);
  }
  for (const event of world.events) {
    for (const causeId of event.causes) {
      const cause = byId.get(causeId);
      if (cause !== undefined) {
        cause.sig += 7;
      }
    }
  }
}

export function eventById(world: World, id: EventId): WorldEvent | undefined {
  return world.events.find((event) => event.id === id);
}

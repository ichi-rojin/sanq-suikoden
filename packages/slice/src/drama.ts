// 責務: 小窓ドラマの編纂。世界で起きた人間の一幕（一騎討ち・義盟・処刑・奪還…）へカメラを寄せるための脚本を作る
// 小窓は基本戦闘システムの一部ではない（裁定R-17）。世界は止まらず、ドラマはただ演出として上に重なる
import type { Drama, DramaBeat, DramaKind, World, WorldEvent } from "./model";
import { nextId, placePos } from "./model";

function beatsFor(kind: DramaKind, event: WorldEvent): DramaBeat[] {
  const [a, b] = event.actors;
  switch (kind) {
    case "duel": {
      if (event.kind === "clash.duel-respect") {
        return [
          { key: "duel.face", ...(a !== undefined ? { speaker: a } : {}) },
          { key: "duel.clash" },
          { key: "duel.respect", ...(b !== undefined ? { speaker: b } : {}) },
        ];
      }
      const fatal = event.data["fatal"] === true;
      return [
        { key: "duel.face", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "duel.clash" },
        fatal ? { key: "duel.fall" } : { key: "duel.yield", ...(b !== undefined ? { speaker: b } : {}) },
      ];
    }
    case "oath":
      return [
        { key: "oath.wine" },
        { key: "oath.vow", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "oath.sworn" },
      ];
    case "execution":
      return [
        { key: "exec.sentence", ...(b !== undefined ? { speaker: b } : {}) },
        { key: "exec.defiance", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "exec.fall" },
      ];
    case "rescue":
      return [
        { key: "rescue.ambush" },
        { key: "rescue.break", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "rescue.flee" },
      ];
    case "frame":
      return [
        { key: "frame.accuse", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "frame.protest", ...(b !== undefined ? { speaker: b } : {}) },
        { key: "frame.exile" },
      ];
    case "feast":
      return [{ key: "feast.gather" }, { key: "feast.toast", ...(a !== undefined ? { speaker: a } : {}) }];
    case "parley":
      return [
        { key: "parley.offer", ...(a !== undefined ? { speaker: a } : {}) },
        { key: "parley.accept", ...(b !== undefined ? { speaker: b } : {}) },
      ];
    default:
      return [];
  }
}

function dramaKindOf(event: WorldEvent): DramaKind | undefined {
  switch (event.kind) {
    case "clash.duel":
    case "clash.duel-respect":
      return "duel";
    case "life.oath":
      return "oath";
    case "life.execute":
      return "execution";
    case "life.rescue-convoy":
    case "life.jailbreak":
      return "rescue";
    case "life.frame":
      return "frame";
    case "life.feast":
      return event.actors.length >= 5 ? "feast" : undefined;
    case "life.recruit":
      return event.data["surrendered"] === true ? "parley" : undefined;
    default:
      return undefined;
  }
}

// 新しく起きたイベントから小窓ドラマを編む（sig順ではなく発生順。世界の脈動のまま）
export function collectDramas(world: World, newEvents: readonly WorldEvent[]): Drama[] {
  const created: Drama[] = [];
  for (const event of newEvents) {
    const kind = dramaKindOf(event);
    if (kind === undefined) {
      continue;
    }
    const at =
      event.at ?? (event.loc !== undefined ? placePos(world, event.loc) : undefined);
    if (at === undefined) {
      continue;
    }
    const drama: Drama = {
      id: nextId(world, "d"),
      tick: event.tick,
      kind,
      at,
      actors: event.actors,
      eventIds: [event.id],
      beats: beatsFor(kind, event),
      ...(event.loc !== undefined ? { loc: event.loc } : {}),
    };
    created.push(drama);
    world.dramas.push(drama);
  }
  // 溜まり過ぎた台本は捨てる（観測されなかったドラマも歴史には残る——イベントが原本）
  if (world.dramas.length > 120) {
    world.dramas.splice(0, world.dramas.length - 120);
  }
  return created;
}

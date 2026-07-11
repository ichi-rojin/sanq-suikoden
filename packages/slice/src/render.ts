// 責務: 観測系の出力整形。世界の状態と物語を読み物として組む（名前と語りはdata層のkit経由で解決）
import { annalsOf, biographyOf, relationDigest } from "./chronicle";
import type { Story, StoryKind } from "./chronicle";
import type { NameRegistry, World, WorldEvent } from "./model";
import { monthOf, yearOf } from "./model";

export interface StoryTitleParamsLike {
  placeName?: string;
  officerName?: string;
  officerName2?: string;
  factionName?: string;
  index: number;
}

export interface TextKit {
  names: NameRegistry;
  narrate(event: WorldEvent): string;
  storyTitle(kind: StoryKind, params: StoryTitleParamsLike): string;
}

const FACTION_KIND_LABEL: Record<string, string> = {
  court: "官",
  warlord: "軍閥",
  manor: "荘園",
  outlaw: "緑林",
  roaming: "放浪",
};

function timeLabel(kit: TextKit, tick: number): string {
  return `${kit.names.yearLabel(yearOf(tick))}${kit.names.monthLabel(monthOf(tick))}`;
}

export function renderAnnals(world: World, kit: TextKit): string[] {
  const lines: string[] = ["", "━━━ 編年史 ━━━"];
  const byYear = annalsOf(world, 58, 12);
  const years = [...byYear.keys()].sort((a, b) => a - b);
  for (const year of years) {
    const events = byYear.get(year) ?? [];
    if (events.length === 0) {
      continue;
    }
    lines.push("", `【${kit.names.yearLabel(year)}】`);
    for (const event of events) {
      lines.push(`  ${kit.names.monthLabel(monthOf(event.tick))}　${kit.narrate(event)}`);
    }
  }
  return lines;
}

export function renderWorldMap(world: World, kit: TextKit): string[] {
  const lines: string[] = ["", "━━━ 天下の形勢 ━━━"];
  for (const place of world.places.values()) {
    const owner = place.owner !== undefined ? kit.names.faction(place.owner) : "（主なし）";
    const scars = place.devastation > 0 ? `　戦禍${Math.floor(place.devastation)}` : "";
    lines.push(
      `  ${kit.names.place(place.id)}　─ ${owner}　兵${Math.floor(place.garrison)}　民心${Math.floor(place.sentiment)}${scars}`,
    );
  }
  lines.push("", "━━━ 勢力録 ━━━");
  for (const faction of world.factions.values()) {
    if (faction.fallenTick !== undefined) {
      lines.push(`  ✝ ${kit.names.faction(faction.id)}（四散）`);
      continue;
    }
    const leaderName = kit.names.officer(faction.leader);
    const label = FACTION_KIND_LABEL[faction.kind] ?? faction.kind;
    const members = faction.members.length;
    const where =
      faction.cities.length > 0
        ? faction.cities.map((c) => kit.names.place(c)).join("・")
        : `${faction.loc !== undefined ? kit.names.place(faction.loc) : "行方知れず"}を流浪`;
    lines.push(`  【${label}】${kit.names.faction(faction.id)}　頭領: ${leaderName}　将${members}名　${where}`);
  }
  return lines;
}

function storyTitleOf(story: Story, kit: TextKit): string {
  const params: StoryTitleParamsLike = { index: story.index };
  if (story.placeId !== undefined) {
    params.placeName = kit.names.place(story.placeId);
  }
  if (story.officerId !== undefined) {
    params.officerName = kit.names.officer(story.officerId);
  }
  if (story.officerId2 !== undefined) {
    params.officerName2 = kit.names.officer(story.officerId2);
  }
  if (story.factionId !== undefined) {
    params.factionName = kit.names.faction(story.factionId);
  }
  return kit.storyTitle(story.kind, params);
}

export function renderStoryShelf(stories: Story[], kit: TextKit, cap: number): string[] {
  const lines: string[] = ["", "━━━ 物語書架（世界が自動で編んだ歴史） ━━━"];
  stories.slice(0, cap).forEach((story, i) => {
    const span =
      yearOf(story.startTick) === yearOf(story.endTick)
        ? kit.names.yearLabel(yearOf(story.startTick))
        : `${kit.names.yearLabel(yearOf(story.startTick))}〜${kit.names.yearLabel(yearOf(story.endTick))}`;
    lines.push(`  ${i + 1}. 『${storyTitleOf(story, kit)}』（${span}・全${story.events.length}章）`);
  });
  return lines;
}

export function renderStory(story: Story, kit: TextKit): string[] {
  const lines: string[] = ["", `◆『${storyTitleOf(story, kit)}』`];
  for (const event of story.events) {
    lines.push(`  ${timeLabel(kit, event.tick)}　${kit.narrate(event)}`);
  }
  return lines;
}

export function renderBiography(world: World, officerId: string, kit: TextKit): string[] {
  const officer = world.officers.get(officerId);
  if (officer === undefined) {
    return [];
  }
  const fate =
    officer.status === "dead"
      ? `${officer.deathTick !== undefined ? kit.names.yearLabel(yearOf(officer.deathTick)) : ""}に没`
      : `存命（${officer.age}歳）`;
  const lines: string[] = ["", `◇ ${kit.names.officer(officerId)}の人生年表　─ ${fate}`];
  const events = biographyOf(world, officerId);
  if (events.length === 0) {
    lines.push("  （記録に残る出来事なし）");
  }
  for (const event of events) {
    lines.push(`  ${timeLabel(kit, event.tick)}　${kit.narrate(event)}`);
  }
  return lines;
}

export function renderRelations(world: World, kit: TextKit): string[] {
  const digest = relationDigest(world);
  const lines: string[] = ["", "━━━ 人物相関（存命者） ━━━"];
  if (digest.bonds.length > 0) {
    lines.push("  ◎ 深き結びつき");
    for (const entry of digest.bonds) {
      const mark = entry.bond ? "義" : "友";
      lines.push(`    [${mark}] ${kit.names.officer(entry.a)} ─ ${kit.names.officer(entry.b)}`);
    }
  }
  if (digest.grudges.length > 0) {
    lines.push("  ● 消えぬ怨恨");
    for (const entry of digest.grudges) {
      lines.push(
        `    ${kit.names.officer(entry.a)} → ${kit.names.officer(entry.b)}（怨${entry.grudges}件）`,
      );
    }
  }
  return lines;
}

// 戦役絵巻: 開戦（遭遇・攻囲）を核に、その戦場で起きた現象を時系列で読む
export function renderCampaign(world: World, index: number, kit: TextKit): string[] {
  const openings = world.events.filter((e) => e.kind === "war.encounter" || e.kind === "war.siege");
  const opening = openings[index];
  if (opening === undefined) {
    return ["", `（第${index + 1}の戦役は記録に無い）`];
  }
  const related = world.events.filter((e) => e.causes.includes(opening.id));
  const lines: string[] = [
    "",
    `━━━ 戦役絵巻 其の${index + 1}（${timeLabel(kit, opening.tick)}） ━━━`,
    `  ${kit.narrate(opening)}`,
  ];
  for (const event of related.slice(0, 40)) {
    lines.push(`  ${timeLabel(kit, event.tick)}　${kit.narrate(event)}`);
  }
  return lines;
}

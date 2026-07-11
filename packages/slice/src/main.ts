// 責務: Vertical SliceのCLI合成根。データ層と世界エンジンを結線し、シミュレーション実行と観測出力を行う
import { writeFileSync } from "node:fs";
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
import { compileStories } from "./chronicle";
import { livingOfficers } from "./model";
import {
  type TextKit,
  renderAnnals,
  renderBiography,
  renderCampaign,
  renderRelations,
  renderStory,
  renderStoryShelf,
  renderWorldMap,
} from "./render";
import { buildWorld, runYears } from "./sim";

interface CliArgs {
  years: number;
  seed: number;
  stories: number;
  biography?: string;
  replay?: number;
  json?: string;
  full: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { years: 15, seed: 7, stories: 6, full: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--years":
        args.years = Number(value);
        i += 1;
        break;
      case "--seed":
        args.seed = Number(value);
        i += 1;
        break;
      case "--stories":
        args.stories = Number(value);
        i += 1;
        break;
      case "--biography":
        if (value !== undefined) {
          args.biography = value;
          i += 1;
        }
        break;
      case "--replay":
        args.replay = Number(value);
        i += 1;
        break;
      case "--json":
        if (value !== undefined) {
          args.json = value;
          i += 1;
        }
        break;
      case "--full":
        args.full = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const names = createNameRegistry(OFFICER_SEEDS, FACTION_SEEDS, PLACE_SEEDS);
  const kit: TextKit = {
    names,
    narrate: (event) => narrateEvent(event, names),
    storyTitle: (kind, params) => storyTitle(kind, params),
  };

  const world = buildWorld(args.seed, {
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

  runYears(world, names, args.years);
  const stories = compileStories(world);
  const campaigns = world.events.filter((e) => e.kind === "war.encounter" || e.kind === "war.siege").length;

  const out: string[] = [];
  out.push("═══════════════════════════════════════");
  out.push(" 縮小世界シミュレーション（三國志IX型 全国戦場TileMap）");
  out.push(` 期間: ${args.years}年　シード: ${args.seed}　記録された出来事: ${world.events.length}件`);
  out.push(` 戦役: ${campaigns}回　編まれた物語: ${stories.length}篇`);
  out.push("═══════════════════════════════════════");

  out.push(...renderAnnals(world, kit));
  out.push(...renderWorldMap(world, kit));
  out.push(...renderStoryShelf(stories, kit, 20));
  for (const story of stories.slice(0, args.stories)) {
    out.push(...renderStory(story, kit));
  }

  if (args.biography !== undefined) {
    const query = args.biography;
    const hit = [...world.officers.keys()].find(
      (id) => id === query || names.officer(id).includes(query) || names.officerShort(id).includes(query),
    );
    if (hit !== undefined) {
      out.push(...renderBiography(world, hit, kit));
    }
  } else {
    const notables = [...world.officers.values()]
      .sort((a, b) => b.memory.length - a.memory.length)
      .slice(0, 4);
    out.push("", "━━━ 列伝 ━━━");
    for (const officer of notables) {
      out.push(...renderBiography(world, officer.id, kit));
    }
  }

  out.push(...renderRelations(world, kit));

  if (args.replay !== undefined) {
    out.push(...renderCampaign(world, args.replay, kit));
  }

  out.push(
    "",
    `（存命の武将: ${livingOfficers(world).length}名／没した武将: ${world.officers.size - livingOfficers(world).length}名）`,
    "使い方: --years N --seed N --stories N --biography 名前 --replay 番号（戦役絵巻を表示） --json 出力先.json",
  );

  process.stdout.write(`${out.join("\n")}\n`);

  if (args.json !== undefined) {
    const dump = {
      tick: world.tick,
      events: world.events,
      stories: stories.map((s) => ({ ...s, events: s.events.map((e) => e.id) })),
      dramas: world.dramas,
    };
    writeFileSync(args.json, JSON.stringify(dump, null, 2), "utf-8");
  }
}

main();

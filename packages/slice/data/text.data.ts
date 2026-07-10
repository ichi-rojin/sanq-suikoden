// 責務: 語り部。イベントを講談調の日本語へ翻訳し、名前解決・題名生成を担う（日本語文字列はこの層に集約）
import type { NameRegistry, WorldEvent } from "../src/model";
import type { OfficerSeed } from "./officers.data";
import type { FactionSeed, PlaceSeed } from "./world.data";
import { ERA_NAME } from "./world.data";

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function kanjiNumber(n: number): string {
  if (n <= 0) return "零";
  if (n < 10) return KANJI_DIGITS[n] ?? "";
  if (n < 20) return `十${KANJI_DIGITS[n - 10] ?? ""}`;
  const tens = Math.floor(n / 10);
  return `${KANJI_DIGITS[tens] ?? ""}十${KANJI_DIGITS[n % 10] ?? ""}`;
}

export function createNameRegistry(
  officerSeeds: readonly OfficerSeed[],
  factionSeeds: readonly FactionSeed[],
  placeSeeds: readonly PlaceSeed[],
): NameRegistry {
  const officerFull = new Map<string, string>();
  const officerPlain = new Map<string, string>();
  const factionHistory = new Map<string, Array<{ tick: number; name: string }>>();
  const placeNames = new Map<string, string>();

  for (const seed of officerSeeds) {
    const plain = `${seed.family}${seed.given}`;
    officerPlain.set(seed.id, plain);
    officerFull.set(seed.id, seed.nickname !== undefined ? `${seed.nickname}${plain}` : plain);
  }
  for (const seed of factionSeeds) {
    factionHistory.set(seed.id, [{ tick: -1, name: seed.name }]);
  }
  for (const seed of placeSeeds) {
    placeNames.set(seed.id, seed.name);
  }

  const rename = (factionId: string, tick: number, name: string): void => {
    const history = factionHistory.get(factionId) ?? [];
    history.push({ tick, name });
    factionHistory.set(factionId, history);
  };

  return {
    officer: (id) => officerFull.get(id) ?? id,
    officerShort: (id) => officerPlain.get(id) ?? id,
    faction: (id, tick) => {
      const history = factionHistory.get(id);
      if (history === undefined || history.length === 0) {
        return id;
      }
      const at = tick ?? Number.MAX_SAFE_INTEGER;
      let name = history[0]?.name ?? id;
      for (const entry of history) {
        if (entry.tick <= at) {
          name = entry.name;
        }
      }
      return name;
    },
    place: (id) => placeNames.get(id) ?? id,
    registerBand: (factionId, leaderId, tick) => {
      rename(factionId, tick, `${officerPlain.get(leaderId) ?? leaderId}の一党`);
    },
    registerLair: (factionId, placeId, tick) => {
      rename(factionId, tick, `${placeNames.get(placeId) ?? placeId}`);
    },
    yearLabel: (year) => `${ERA_NAME}${year === 0 ? "元" : kanjiNumber(year + 1)}年`,
    monthLabel: (month) => `${kanjiNumber(month)}月`,
  };
}

function joinNames(names: string[]): string {
  return names.join("、");
}

const CALAMITY_TEXT: Record<string, string> = {
  flood: "大水出でて、田畑ことごとく濁流に沈む",
  locust: "蝗の群れ空を覆い、実りを喰い尽くす",
  drought: "日照り続きて井戸涸れ、流民が道に溢れる",
};

// イベント一件を一文の講談へ。dataフィールドの規約はエンジン側emit呼び出しと対で保守する
export function narrateEvent(e: WorldEvent, n: NameRegistry): string {
  const d = e.data;
  const s = (key: string): string => (typeof d[key] === "string" ? (d[key] as string) : "");
  const off = (key: string): string => n.officer(s(key));
  const loc = e.loc !== undefined ? n.place(e.loc) : "";
  const actorNames = e.actors.map((a) => n.officer(a));
  const fac = (i: number): string => n.faction(e.factions[i] ?? "", e.tick);

  switch (e.kind) {
    case "agit.disaster":
      return `${loc}に${CALAMITY_TEXT[s("calamity")] ?? "災いが降りかかる"}。`;
    case "agit.extortion":
      return `${fac(0)}、${loc}に苛斂誅求の重税を課す。民の怨嗟、道に満ちる。`;
    case "faction.crackdown":
      return `${fac(0)}、緑林討伐の触れを出す。賞金首の高札が諸県に立った。`;
    case "faction.found":
      return `${off("leader")}、${loc}に旗を揚げる。世人これを${fac(0)}と呼ぶ。`;
    case "faction.lair":
      return `${off("leader")}の一党、${loc}に砦を構えて山寨を開く。`;
    case "faction.rise":
      return `${fac(0)}、ついに${loc}を奪って城市の主となる。緑林の徒が官の城に旗を立てた。`;
    case "faction.fall":
      return `${fac(0)}、最後の根拠を失い、生き残った者たちは流浪の身となる。`;
    case "faction.disband":
      return `${fac(0)}、頭領を失って四散する。`;
    case "faction.succession":
      return `${off("old")}亡きあと、${off("next")}が${fac(0)}の頭領に立つ。`;
    case "faction.split":
      return `${off("leader")}、志を異にして${fac(0)}を割って出る。`;
    case "war.declare":
      return `${fac(0)}、${n.place(s("target"))}へ兵を発す。総勢${String(d["troops"] ?? "数千")}。`;
    case "war.battle":
      return `${loc}に戦端開く。寄せ手は${fac(0)}、守るは${fac(1)}。`;
    case "war.city-fall":
      return `${loc}、陥落。${fac(0)}の旗が城頭に翻る。`;
    case "war.repelled":
      return `${loc}の守りは固く、${fac(0)}は兵を退いた。`;
    case "war.plunder":
      return `${loc}は掠奪の巷と化す。火の手と泣き声が三日絶えなかった。`;
    case "war.raid":
      return `${fac(0)}、${loc}の近郷を荒らし、米と銭を担いで山へ帰る。`;
    case "clash.charge":
      return `${off("attacker")}、真一文字に${off("target")}の陣へ突き入る!`;
    case "clash.knockback": {
      const into = s("into");
      if (into === "water") return `${off("target")}の隊、突き崩されて水際まで押し込まれる!`;
      if (into === "fire") return `${off("target")}の隊、炎の中へ吹き飛ばされる!`;
      if (into === "unit") return `${off("target")}の隊、味方を巻き込んで将棋倒しに崩れる!`;
      return `${off("target")}の隊、二間も後ろへ吹き飛ばされる!`;
    }
    case "clash.drown":
      return `${off("victim")}の隊、泥水に呑まれ、溺れる者数知れず。`;
    case "clash.volley":
      return `${off("shooter")}の号令一下、矢の雨が空を黒く染めて降り注ぐ。`;
    case "clash.stray": {
      const side = d["victimSide"] === "ally" ? "——放ったのは味方の" : "——放ったのは";
      return `流れ矢あり! ${off("victim")}の肩口に突き立つ。${side}${off("culprit")}であった。`;
    }
    case "clash.fire":
      return `${off("arsonist")}、風を読んで火を放つ。炎はたちまち燃え広がる。`;
    case "clash.burn":
      return `炎が${off("victim")}の隊を呑み込む。`;
    case "clash.sorcery":
      return d["mode"] === "fog"
        ? `${off("caster")}、印を結べば白霧わき起こり、敵も味方も見えなくなる。`
        : `${off("caster")}、剣を振るって呪を唱える。黒雲うずまき、雷が戦場を裂いた。`;
    case "clash.rockfall":
      return `${off("actor")}の合図で崖が崩れ落ちる! 大地は形を変え、そこにあった道が消えた。`;
    case "clash.terrain": {
      const what = s("what");
      if (what === "gate-breach") return `${loc}の城門、焼け崩れて大穴が開く。`;
      if (what === "burnt") return `${loc}の戦場、焼け野原と化す。`;
      return `${loc}の戦場に瓦礫の山が築かれ、地形が変わった。`;
    }
    case "clash.ambush":
      return `林の奥から${off("actor")}の伏兵が鬨の声とともに躍り出る!`;
    case "clash.taunt":
      return `${off("taunter")}の罵声に${off("target")}は逆上し、下知も忘れて単騎突出する。`;
    case "clash.duel": {
      const rounds = kanjiNumber(typeof d["rounds"] === "number" ? (d["rounds"] as number) : 10);
      if (d["fatal"] === true) {
        return `${off("winner")}と${off("loser")}、陣前で一騎討ち。${rounds}合の末、${off("loser")}は馬上から斬って落とされた。`;
      }
      return `${off("winner")}と${off("loser")}、陣前で一騎討ち。${rounds}合の末、${off("loser")}が退く。`;
    }
    case "clash.duel-respect":
      return `${joinNames(actorNames)}、打ち合うこと数十合、勝負つかず。両雄互いの腕に舌を巻いた。`;
    case "clash.rescue":
      return `危うし${off("saved")}! そこへ${off("savior")}が割って入り、九死に一生を得る。`;
    case "clash.rout":
      return `${off("officer")}の隊、支えきれず崩れ立つ。`;
    case "clash.fall":
      return s("killer") !== ""
        ? `${off("victim")}、${off("killer")}の手にかかり戦場に散る。`
        : `${off("victim")}、乱軍の中に討死。`;
    case "clash.capture":
      return `${off("victim")}、組み伏せられて生け捕りとなる。`;
    case "life.meet":
      return `${joinNames(actorNames)}、${loc}にて初めて相まみえる。`;
    case "life.feast":
      return `${joinNames(actorNames.slice(0, 4))}${actorNames.length > 4 ? "ら" : ""}、${loc}に酒宴を張る。杯がめぐり、豪傑の笑声が夜更けまで響いた。`;
    case "life.quarrel":
      return d["deep"] === true
        ? `酒の座で${actorNames[0]}と${actorNames[1]}が口論、ついに膳を蹴って立つ。この夜の遺恨、のちまで尾を引くことになる。`
        : `${actorNames[0]}と${actorNames[1]}、${loc}で口論に及ぶ。`;
    case "life.oath":
      return `${joinNames(actorNames)}、${loc}に香を焚いて義を結ぶ。生まれた日は違えども、死する時は同じくせんと誓った。`;
    case "life.defect":
      return `${off("officer")}、${fac(0)}に愛想を尽かして出奔。行方をくらます。`;
    case "life.desert":
      return `${joinNames(actorNames)}、袂を連ねて${fac(0)}を去る。`;
    case "life.join":
      return `${off("joiner")}、${off("leader")}の一党に身を投じる。`;
    case "life.recruit":
      return `${off("leader")}のたっての誘いに、${off("joiner")}は膝を打って応じた。`;
    case "life.revenge":
      return d["fatal"] === true
        ? `積年の怨み、晴らさでおくべきか。${off("avenger")}、白刃をひらめかせて${off("victim")}を討つ!`
        : `${off("avenger")}、${off("victim")}に斬りかかる。積年の怨みの一太刀であった。`;
    case "life.duel":
      return `${off("winner")}と${off("loser")}、意地を賭けて立ち合い、${off("winner")}が勝ちを収める。`;
    case "life.frame":
      return `${off("orderer")}の讒訴により、${off("victim")}に身に覚えなき罪。額に金印を打たれ、流刑と決まった。`;
    case "life.convoy":
      return `${off("prisoner")}、枷をはめられ${n.place(s("dest"))}へと護送されてゆく。`;
    case "life.rescue-convoy":
      return `護送の列が${loc}の林道に差しかかったその時、${off("rescuer")}が躍り出て枷を叩き割る! ${off("prisoner")}、虎口を脱す。`;
    case "life.jailbreak":
      return `${off("rescuer")}、夜陰に乗じて${loc}の牢を破り、${off("prisoner")}を救い出す!`;
    case "war.raze":
      return `${fac(0)}の兵、${loc}の砦を焼き払って引き揚げる。要害は再び主なき山に戻った。`;
    case "life.prison":
      return `${off("prisoner")}、${loc}の牢城に繋がれる。`;
    case "life.execute":
      return `${off("victim")}、${loc}の市曹に引き出され、首を刎ねられる。見よ、これが世の法というものか。`;
    case "life.release":
      return `${off("captor")}、自ら縄を解いて${off("released")}を放つ。「行かれよ。いずれまた会うこともあろう」`;
    case "life.illness-death":
      return `${off("officer")}、病を得て世を去る。享年${kanjiNumber(typeof d["age"] === "number" ? (d["age"] as number) : 0)}。`;
    case "life.raid-travelers":
      return `${off("actor")}ら、${loc}の街道に出て行商の荷を掠める。`;
    default:
      return `${loc}にて出来事あり(${e.kind})。`;
  }
}

export type StoryKind = "war" | "outlaw" | "oath" | "revenge" | "rise" | "collapse" | "duel";

export interface StoryTitleParams {
  placeName?: string;
  officerName?: string;
  officerName2?: string;
  factionName?: string;
  index: number;
}

export function storyTitle(kind: StoryKind, p: StoryTitleParams): string {
  switch (kind) {
    case "war": {
      const variants = [
        `${p.placeName}の戦い`,
        `${p.placeName}攻防戦`,
        `${p.placeName}血戦`,
      ];
      return variants[p.index % variants.length] ?? `${p.placeName}の戦い`;
    }
    case "outlaw":
      return `${p.officerName}、野に走る`;
    case "oath":
      return p.officerName2 !== undefined
        ? `${p.officerName}と${p.officerName2}、義を結ぶ`
        : `${p.placeName}の義盟`;
    case "revenge":
      return `${p.officerName}の意趣返し`;
    case "rise":
      return `${p.factionName}、旗揚げ`;
    case "collapse":
      return `${p.factionName}の落日`;
    case "duel":
      return `${p.officerName}対${p.officerName2}`;
    default:
      return "無題の記";
  }
}

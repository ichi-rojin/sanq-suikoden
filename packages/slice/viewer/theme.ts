// 責務: Viewerの見た目定義。セル寸法・勢力色・地形タイル/技の表示対応（描画専用、シムには影響しない）
import { T } from "../src/grid";

export const CELL = 8; // 1グリッドセルの描画ピクセル

// 初期勢力の旗色（勢力識別を最優先）
const FIXED_FACTION_COLORS: Record<string, number> = {
  court: 0xd9a441, // 宋朝: 金
  fangla: 0x9b59b6, // 方臘: 紫
  tianhu: 0x2e9c8f, // 田虎: 翠
  wangqing: 0xa9713f, // 王慶: 褐
  zhu: 0x4f9d69, // 祝家荘: 緑
  zeng: 0x3f8fbf, // 曾頭市: 蒼
  "liangshan-band": 0xc0392b, // 梁山泊: 紅
  "taohua-band": 0xc2559d, // 桃花山: 桃
};

const DYNAMIC_COLOR_POOL = [
  0xe74c3c, 0x8e44ad, 0xe67e22, 0x16a085, 0x2980b9, 0xa0522d, 0x27ae60, 0xd35400,
  0x7f6fd0, 0xb8860b, 0x5f9ea0, 0xcd5c5c, 0x6b8e23, 0xba55d3,
];

const assigned = new Map<string, number>();
let poolCursor = 0;

export function factionColor(factionId: string | undefined): number {
  if (factionId === undefined || factionId === "") {
    return 0x8a8a8a;
  }
  const fixed = FIXED_FACTION_COLORS[factionId];
  if (fixed !== undefined) {
    return fixed;
  }
  let color = assigned.get(factionId);
  if (color === undefined) {
    color = DYNAMIC_COLOR_POOL[poolCursor % DYNAMIC_COLOR_POOL.length] as number;
    poolCursor += 1;
    assigned.set(factionId, color);
  }
  return color;
}

// 世界タイル → 基調色（CSS色。地形Canvasの塗りに使う）
export const TILE_COLORS: Record<number, string> = {
  [T.plain]: "#46543a",
  [T.road]: "#8a7454",
  [T.forest]: "#28421f",
  [T.mountain]: "#575046",
  [T.river]: "#2f5a7d",
  [T.ford]: "#5a7a8a",
  [T.marsh]: "#3a5c60",
  [T.dry]: "#8d7c55",
  [T.sea]: "#1d3d5c",
  [T.city]: "#6f6046",
  [T.wall]: "#8d8d8d",
  [T.gate]: "#a88a5a",
  [T.burnt]: "#2b2320",
  [T.rubble]: "#55504a",
  [T.hill]: "#5c6b40",
};

// 兵法発動ポップ（SAN9の「発動が癖になる」を移植）
export const SKILL_POP: Record<string, { label: string; color: number }> = {
  "clash.charge": { label: "突撃", color: 0xffffff },
  "clash.volley": { label: "斉射", color: 0xffe9a8 },
  "clash.stray": { label: "流れ矢!", color: 0xff6a55 },
  "clash.fire": { label: "火計", color: 0xff9a3d },
  "clash.sorcery": { label: "妖術", color: 0xc9a0ff },
  "clash.rockfall": { label: "落石", color: 0xd8cba8 },
  "clash.ambush": { label: "伏兵", color: 0x8fe08f },
  "clash.taunt": { label: "挑発", color: 0xffd0d0 },
  "clash.duel": { label: "一騎討ち", color: 0xffd76a },
  "clash.duel-respect": { label: "一騎討ち", color: 0xffd76a },
  "clash.drown": { label: "水没", color: 0x9ad0ff },
  "clash.burn": { label: "延焼", color: 0xff7a3d },
  "clash.rescue": { label: "救援", color: 0x9af0c0 },
  "war.gate-breach": { label: "城門破壊!", color: 0xffb060 },
  "war.join": { label: "横槍!", color: 0xa0ffd0 },
};

export const FONT_JP =
  '"Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif';

export function logClassOf(kind: string): string {
  if (kind.startsWith("war.")) return "log-war";
  if (kind.startsWith("faction.")) return "log-faction";
  if (kind === "life.oath" || kind === "life.join" || kind === "life.recruit") return "log-bond";
  if (
    kind === "life.frame" ||
    kind === "life.execute" ||
    kind === "life.revenge" ||
    kind === "life.quarrel"
  ) {
    return "log-grudge";
  }
  if (kind.startsWith("agit.")) return "log-agit";
  if (kind.startsWith("clash.")) return "log-clash";
  return "log-plain";
}

// 決定論的な擬似乱数（描画の散らし用。Math.random禁止規約対応）
export function decoRand(seedText: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= n * 2654435761;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 責務: Viewerの見た目定義。拠点の盤上座標・勢力色・地形記号の色対応（描画専用データ、シムには影響しない）
export interface Vec2 {
  x: number;
  y: number;
}

// 世界俯瞰マップの拠点座標（論理座標系 1000x760）
export const PLACE_POS: Record<string, Vec2> = {
  jizhou: { x: 450, y: 330 },
  yuncheng: { x: 280, y: 440 },
  yanggu: { x: 560, y: 500 },
  yizhou: { x: 780, y: 330 },
  zhujiazhuang: { x: 420, y: 590 },
  zengtou: { x: 700, y: 560 },
  liangshan: { x: 170, y: 570 },
  erlong: { x: 640, y: 160 },
  taohua: { x: 880, y: 480 },
  yezhulin: { x: 610, y: 280 },
  dongxi: { x: 140, y: 430 },
};

// 初期勢力の旗色（三國志IX風に、勢力ごとの識別色を最優先）
const FIXED_FACTION_COLORS: Record<string, number> = {
  court: 0xd9a441, // 官府: 金
  zhu: 0x4f9d69, // 祝家荘: 緑
  zeng: 0x3f8fbf, // 曾頭市: 蒼
  "liangshan-band": 0xc0392b, // 梁山泊: 紅
  "taohua-band": 0xc2559d, // 桃花山: 桃
};

const DYNAMIC_COLOR_POOL = [
  0xe74c3c, 0x8e44ad, 0xe67e22, 0x16a085, 0x2980b9, 0xa0522d, 0x27ae60, 0xd35400,
  0x7f6fd0, 0xb8860b, 0x5f9ea0, 0xcd5c5c,
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

// 合戦リプレイの盤面記号 → タイル色
export const TERRAIN_COLORS: Record<string, number> = {
  "・": 0x4c5b3c, // 平地
  木: 0x2f4d2b, // 林
  波: 0x2b4a6f, // 水
  山: 0x6b5d4a, // 崖
  壁: 0x8d8d8d, // 城壁
  門: 0xa88a5a, // 城門
  瓦: 0x55504a, // 瓦礫
  焦: 0x2b2320, // 焼け跡
  沼: 0x3a5a52, // 湿地
  営: 0x7a6248, // 本営
  炎: 0xe25822, // 炎上中
};

export const ATTACKER_GLYPHS = new Set(["Ａ", "Ｂ", "Ｃ", "Ｄ", "Ｅ", "Ｆ"]);
export const DEFENDER_GLYPHS = new Set(["甲", "乙", "丙", "丁", "戊", "己"]);

export const FONT_JP =
  '"Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif';

// ログの種別色（HTML側のclassに対応）
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

// 拠点ID由来の決定論的な擬似乱数（地形装飾の配置に使う。Math.random禁止規約対応）
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

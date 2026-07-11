// 責務: 中国全土マップ（世界は三國志IX、物語は水滸伝）。グリッド座標・拠点71・街道網・地勢・初期勢力のデータ
// グリッドはWeb調査で確認したSAN9の内部構造（スクエア200×200、San9ME解析。docs/impl/proto/san9-map-analysis.md §1）
import type { Edge, FactionKind, PlaceKind, PolicyKind } from "../src/model";

// 執筆座標系（画像分析時の推定グリッド。gx/gyで実グリッドへ再スケールされる）
const AUTHOR_W = 216;
const AUTHOR_H = 184;
export const GRID_W = 200;
export const GRID_H = 200;

const gx = (x: number): number => Math.round((x * GRID_W) / AUTHOR_W);
const gy = (y: number): number => Math.round((y * GRID_H) / AUTHOR_H);

export interface PlaceSeed {
  id: string;
  name: string;
  kind: PlaceKind;
  gridX: number;
  gridY: number;
  wealth: number;
  population: number;
  order: number;
  sentiment: number;
  defense: number;
  garrison: number;
  owner?: string;
  terrainForest: number;
  terrainCliff: number;
  terrainWater: number;
}

interface CityOpt {
  owner?: string;
  garrison?: number;
  forest?: number;
  cliff?: number;
  water?: number;
  sentiment?: number;
}

// tier1=都(最大) tier2=府(大城市) tier3=州(中規模)
function city(id: string, name: string, x: number, y: number, tier: 1 | 2 | 3, opt: CityOpt = {}): PlaceSeed {
  const base =
    tier === 1
      ? { kind: "capital" as PlaceKind, wealth: 95, population: 100, defense: 85, garrison: 4500 }
      : tier === 2
        ? { kind: "capital" as PlaceKind, wealth: 68, population: 72, defense: 62, garrison: 1700 }
        : { kind: "county" as PlaceKind, wealth: 48, population: 52, defense: 48, garrison: 950 };
  return {
    id, name, kind: base.kind, gridX: gx(x), gridY: gy(y),
    wealth: base.wealth, population: base.population,
    order: 50, sentiment: opt.sentiment ?? 46,
    defense: base.defense, garrison: opt.garrison ?? base.garrison,
    terrainForest: opt.forest ?? 0.12, terrainCliff: opt.cliff ?? 0.05, terrainWater: opt.water ?? 0.08,
    ...(opt.owner !== undefined ? { owner: opt.owner } : {}),
  };
}

function town(id: string, name: string, x: number, y: number, owner?: string): PlaceSeed {
  return {
    id, name, kind: "town", gridX: gx(x), gridY: gy(y),
    wealth: 30, population: 28, order: 45, sentiment: 58, defense: 20, garrison: 150,
    terrainForest: 0.2, terrainCliff: 0, terrainWater: 0.2,
    ...(owner !== undefined ? { owner } : {}),
  };
}

function manor(id: string, name: string, x: number, y: number, owner: string): PlaceSeed {
  return {
    id, name, kind: "manor", gridX: gx(x), gridY: gy(y),
    wealth: 62, population: 45, order: 70, sentiment: 55, defense: 60, garrison: 1600, owner,
    terrainForest: 0.2, terrainCliff: 0, terrainWater: 0.1,
  };
}

function lair(id: string, name: string, x: number, y: number, marsh = false, owner?: string): PlaceSeed {
  return {
    id, name, kind: marsh ? "marsh" : "lairsite", gridX: gx(x), gridY: gy(y),
    wealth: marsh ? 20 : 12, population: marsh ? 15 : 8, order: 25, sentiment: 55,
    defense: marsh ? 55 : 50, garrison: owner !== undefined ? 300 : 0,
    terrainForest: marsh ? 0.25 : 0.45, terrainCliff: marsh ? 0 : 0.3, terrainWater: marsh ? 0.5 : 0,
    ...(owner !== undefined ? { owner } : {}),
  };
}

function pass(id: string, name: string, x: number, y: number, forest = 0.55): PlaceSeed {
  return {
    id, name, kind: "pass", gridX: gx(x), gridY: gy(y),
    wealth: 5, population: 3, order: 20, sentiment: 50, defense: 10, garrison: 0,
    terrainForest: forest, terrainCliff: 0.2, terrainWater: 0.05,
  };
}

function port(id: string, name: string, x: number, y: number): PlaceSeed {
  return {
    id, name, kind: "port", gridX: gx(x), gridY: gy(y),
    wealth: 18, population: 8, order: 30, sentiment: 50, defense: 12, garrison: 0,
    terrainForest: 0.08, terrainCliff: 0, terrainWater: 0.5,
  };
}

const C = "court";

export const PLACE_SEEDS: PlaceSeed[] = [
  // ===== 河北・燕地 =====
  city("youzhou", "幽州", 150, 30, 2, { owner: C, forest: 0.2 }),
  city("cangzhou", "滄州", 146, 44, 3, { owner: C }),
  city("zhending", "真定", 128, 44, 3, { owner: C }),
  city("gaotang", "高唐州", 136, 56, 3, { owner: C }),
  city("daming", "大名府", 132, 62, 2, { owner: C, garrison: 2400 }),
  // ===== 山西（田虎の地） =====
  city("taiyuan", "太原", 112, 50, 2, { owner: C, cliff: 0.18 }),
  city("weisheng", "威勝", 108, 58, 3, { owner: "tianhu", garrison: 2200, cliff: 0.2 }),
  city("longde", "隆徳", 116, 60, 3, { owner: "tianhu", garrison: 1400, cliff: 0.2 }),
  city("yanan", "延安", 82, 52, 3, { owner: C, cliff: 0.15 }),
  // ===== 関中・西辺 =====
  city("weizhou", "渭州", 56, 76, 3, { owner: C, cliff: 0.12 }),
  city("changan", "長安", 78, 80, 2, { owner: C, garrison: 2200 }),
  city("luoyang", "洛陽", 102, 82, 2, { owner: C, garrison: 2000 }),
  // ===== 中原 =====
  city("kaifeng", "開封", 122, 80, 1, { owner: C, sentiment: 38 }),
  city("yingtian", "応天府", 130, 88, 3, { owner: C }),
  city("nanyang", "南陽", 112, 94, 3, { owner: C }),
  // ===== 山東（水滸の舞台） =====
  city("jizhou", "済州", 140, 72, 3, { owner: C }),
  city("yuncheng", "鄆城", 133, 74, 3, { owner: C, garrison: 700, water: 0.15 }),
  city("qingzhou", "青州", 156, 60, 2, { owner: C }),
  city("dengzhou", "登州", 176, 52, 3, { owner: C, water: 0.25 }),
  city("yizhou", "沂州", 150, 78, 3, { owner: C, forest: 0.2 }),
  city("xuzhou", "徐州", 144, 88, 3, { owner: C }),
  // ===== 淮南・江東 =====
  city("chuzhou", "楚州", 152, 96, 3, { owner: C, water: 0.2 }),
  city("yangzhou", "揚州", 156, 104, 2, { owner: C, water: 0.25 }),
  city("jinling", "金陵", 152, 112, 2, { owner: C, garrison: 2200, water: 0.25 }),
  city("suzhou", "蘇州", 162, 118, 3, { owner: C, water: 0.3 }),
  city("luzhou", "廬州", 136, 102, 3, { owner: C }),
  // ===== 江南（方臘の地） =====
  city("hangzhou", "杭州", 164, 126, 2, { owner: "fangla", garrison: 3200, water: 0.3, sentiment: 52 }),
  city("muzhou", "睦州", 158, 134, 3, { owner: "fangla", garrison: 1500, forest: 0.25 }),
  city("shezhou", "歙州", 150, 130, 3, { owner: "fangla", garrison: 1300, forest: 0.3, cliff: 0.1 }),
  // ===== 長江中流 =====
  city("jiangzhou", "江州", 134, 124, 3, { owner: C, water: 0.3 }),
  city("hongzhou", "洪州", 132, 138, 3, { owner: C, water: 0.15 }),
  city("ezhou", "鄂州", 118, 118, 3, { owner: C, water: 0.3 }),
  city("jiangling", "江陵", 104, 120, 2, { owner: C, water: 0.25 }),
  city("xiangyang", "襄陽", 104, 104, 2, { owner: C, garrison: 2000, water: 0.2 }),
  // ===== 淮西（王慶の地） =====
  city("fangzhou", "房州", 94, 108, 3, { owner: "wangqing", garrison: 1800, forest: 0.3, cliff: 0.15 }),
  city("junzhou", "均州", 90, 104, 3, { owner: "wangqing", garrison: 1200, forest: 0.25 }),
  // ===== 巴蜀 =====
  city("hanzhong", "漢中", 76, 100, 3, { owner: C, cliff: 0.2 }),
  city("zizhou", "梓州", 58, 110, 3, { owner: C, cliff: 0.15 }),
  city("chengdu", "成都", 44, 116, 2, { owner: C, garrison: 2200 }),
  city("yuzhou", "渝州", 64, 128, 3, { owner: C, cliff: 0.2, water: 0.2 }),
  // ===== 荊南・嶺南 =====
  city("tanzhou", "潭州", 114, 142, 3, { owner: C, water: 0.2 }),
  city("guizhou", "桂州", 96, 156, 3, { owner: C, forest: 0.3 }),
  city("guangzhou", "広州", 118, 168, 2, { owner: C, water: 0.25, forest: 0.2 }),
  city("qianzhou", "虔州", 134, 150, 3, { owner: C, forest: 0.3 }),
  // ===== 東南沿海 =====
  city("fuzhou", "福州", 164, 146, 3, { owner: C, water: 0.25, forest: 0.25 }),
  city("quanzhou", "泉州", 156, 156, 3, { owner: C, water: 0.3 }),
  // ===== 村鎮・荘園 =====
  town("dongxi", "東渓村", 143, 76, C),
  town("qingfeng", "清風鎮", 158, 66, C),
  manor("zhujiazhuang", "祝家荘", 137, 79, "zhu"),
  manor("zengtou", "曾頭市", 140, 52, "zeng"),
  // ===== 要害（山寨適地・水泊） =====
  lair("liangshan", "梁山泊", 136, 70, true, "liangshan-band"),
  lair("erlong", "二龍山", 160, 64),
  lair("taohua", "桃花山", 162, 70, false, "taohua-band"),
  lair("shaohua", "少華山", 90, 88),
  lair("yinma", "飲馬川", 142, 48),
  // ===== 関 =====
  pass("waqiao", "瓦橋関", 146, 38, 0.3),
  pass("jingxing", "井陘関", 120, 48, 0.3),
  pass("hulao", "虎牢関", 112, 81, 0.25),
  pass("tongguan", "潼関", 92, 82, 0.25),
  pass("dasan", "大散関", 66, 92, 0.35),
  pass("jianmen", "剣門関", 60, 102, 0.4),
  pass("qutang", "瞿塘関", 78, 124, 0.35),
  pass("meiguan", "梅関", 124, 158, 0.5),
  pass("xianxia", "仙霞関", 158, 140, 0.5),
  pass("yezhulin", "野猪林", 128, 74, 0.7),
  // ===== 港（渡河・海運の要衝） =====
  port("baima", "白馬渡", 126, 66),
  port("pujin", "蒲津渡", 92, 68),
  port("guazhou", "瓜洲渡", 154, 108),
  port("hanyang", "漢陽渡", 114, 120),
  port("xunyang", "潯陽渡", 132, 116),
  port("mingzhou", "明州港", 174, 128),
  port("dongting", "洞庭渡", 107, 128),
  port("qichun", "蘄春渡", 126, 121),
];

const E = (from: string, to: string): Edge => ({ from, to });

export const EDGE_SEEDS: Edge[] = [
  // 河北・燕
  E("youzhou", "waqiao"), E("waqiao", "cangzhou"), E("youzhou", "zhending"),
  E("zhending", "cangzhou"), E("zhending", "jingxing"), E("jingxing", "taiyuan"),
  E("cangzhou", "gaotang"), E("cangzhou", "zengtou"), E("zengtou", "gaotang"),
  E("gaotang", "daming"), E("gaotang", "qingzhou"), E("daming", "zhending"),
  E("yinma", "cangzhou"),
  // 山西・関中
  E("taiyuan", "weisheng"), E("weisheng", "longde"), E("longde", "taiyuan"),
  E("longde", "luoyang"), E("taiyuan", "pujin"), E("pujin", "changan"),
  E("yanan", "changan"), E("weizhou", "changan"),
  E("changan", "tongguan"), E("tongguan", "luoyang"), E("luoyang", "hulao"), E("hulao", "kaifeng"),
  E("changan", "shaohua"),
  // 中原・山東
  E("daming", "baima"), E("baima", "yezhulin"), E("yezhulin", "kaifeng"),
  E("yezhulin", "yuncheng"), E("yuncheng", "jizhou"), E("yuncheng", "liangshan"),
  E("jizhou", "liangshan"), E("liangshan", "zhujiazhuang"), E("zhujiazhuang", "yuncheng"),
  E("jizhou", "dongxi"), E("dongxi", "qingzhou"), E("jizhou", "gaotang"),
  E("qingzhou", "qingfeng"), E("qingfeng", "taohua"), E("taohua", "yizhou"),
  E("qingzhou", "erlong"), E("qingzhou", "dengzhou"),
  E("jizhou", "yizhou"), E("yizhou", "xuzhou"),
  E("kaifeng", "yingtian"), E("yingtian", "xuzhou"), E("yingtian", "luzhou"),
  E("kaifeng", "nanyang"), E("luoyang", "nanyang"),
  // 淮南・江東
  E("xuzhou", "chuzhou"), E("chuzhou", "yangzhou"), E("yangzhou", "guazhou"),
  E("guazhou", "jinling"), E("jinling", "suzhou"), E("suzhou", "hangzhou"),
  E("hangzhou", "mingzhou"), E("hangzhou", "muzhou"), E("muzhou", "shezhou"),
  E("shezhou", "hongzhou"), E("luzhou", "xunyang"), E("xunyang", "jiangzhou"),
  E("luzhou", "yangzhou"),
  // 長江中流・荊楚
  E("nanyang", "xiangyang"), E("xiangyang", "jiangling"), E("xiangyang", "junzhou"),
  E("junzhou", "fangzhou"), E("junzhou", "hanzhong"),
  E("jiangling", "hanyang"), E("hanyang", "ezhou"), E("ezhou", "qichun"), E("qichun", "jiangzhou"),
  E("jiangzhou", "hongzhou"), E("jiangling", "dongting"), E("dongting", "tanzhou"),
  // 巴蜀
  E("changan", "dasan"), E("dasan", "hanzhong"), E("hanzhong", "jianmen"),
  E("jianmen", "zizhou"), E("zizhou", "chengdu"), E("zizhou", "yuzhou"),
  E("yuzhou", "qutang"), E("qutang", "jiangling"),
  // 江南・嶺南・沿海
  E("hongzhou", "qianzhou"), E("qianzhou", "meiguan"), E("meiguan", "guangzhou"),
  E("tanzhou", "guizhou"), E("guizhou", "guangzhou"), E("tanzhou", "hongzhou"),
  E("muzhou", "xianxia"), E("xianxia", "fuzhou"), E("fuzhou", "quanzhou"),
  E("quanzhou", "guangzhou"),
];

// ---- 地勢（Viewerのタイル地形描画用） ----
export type GeoKind = "river" | "canal" | "ridge" | "forest" | "marsh";

export interface GeoFeature {
  kind: GeoKind;
  points: Array<[number, number]>;
  width?: number; // river/canal/ridge: セル幅
  radius?: number; // forest/marsh: 塊の半径
}

const pts = (raw: Array<[number, number]>): Array<[number, number]> =>
  raw.map(([x, y]) => [gx(x), gy(y)]);

export const GEO_FEATURES: GeoFeature[] = [
  // 黄河（蒲津渡・白馬渡を通り渤海へ）
  { kind: "river", width: 1.5, points: pts([[8, 64], [36, 56], [58, 58], [76, 64], [92, 68], [100, 74], [110, 76], [120, 70], [126, 66], [136, 58], [146, 50], [158, 46], [168, 42]]) },
  // 長江（瞿塘関・漢陽渡・潯陽渡・瓜洲渡を通り東シナ海へ）
  { kind: "river", width: 1.7, points: pts([[18, 122], [40, 124], [58, 128], [70, 126], [78, 124], [88, 123], [100, 121], [114, 120], [124, 119], [132, 118], [142, 116], [152, 111], [160, 108], [170, 106]]) },
  // 淮河
  { kind: "river", width: 1.1, points: pts([[114, 96], [126, 98], [138, 100], [150, 98], [162, 100]]) },
  // 大運河（開封→揚州→杭州）
  { kind: "canal", width: 0.9, points: pts([[122, 80], [128, 86], [136, 94], [144, 98], [152, 102], [156, 104], [158, 110], [160, 118], [162, 124], [164, 126]]) },
  // 漢水
  { kind: "river", width: 1.0, points: pts([[74, 98], [84, 102], [94, 106], [104, 112], [110, 116], [114, 120]]) },
  // 渭水
  { kind: "river", width: 1.0, points: pts([[58, 78], [70, 81], [82, 81], [92, 80], [100, 75]]) },
  // 湘江・贛江・珠江
  { kind: "river", width: 1.0, points: pts([[112, 152], [114, 142], [116, 132], [117, 124]]) },
  { kind: "river", width: 1.0, points: pts([[134, 148], [133, 140], [132, 132], [133, 125]]) },
  { kind: "river", width: 1.2, points: pts([[98, 158], [108, 164], [118, 168], [128, 170], [136, 170]]) },
  // 山脈
  { kind: "ridge", width: 4, points: pts([[114, 42], [112, 52], [110, 62], [108, 70]]) }, // 太行
  { kind: "ridge", width: 3, points: pts([[100, 46], [102, 58], [104, 66]]) }, // 呂梁
  { kind: "ridge", width: 4, points: pts([[58, 90], [72, 90], [86, 88], [98, 87]]) }, // 秦嶺
  { kind: "ridge", width: 3, points: pts([[52, 68], [54, 80]]) }, // 隴山
  { kind: "ridge", width: 3, points: pts([[60, 106], [74, 110], [86, 112]]) }, // 大巴
  { kind: "ridge", width: 6, points: pts([[28, 96], [32, 112], [36, 128], [42, 140]]) }, // 蜀西山地
  { kind: "ridge", width: 3, points: pts([[82, 118], [88, 122]]) }, // 巫山
  { kind: "ridge", width: 3, points: pts([[120, 106], [128, 108]]) }, // 大別山
  { kind: "ridge", width: 4, points: pts([[94, 160], [108, 158], [120, 160]]) }, // 南嶺
  { kind: "ridge", width: 3, points: pts([[146, 134], [150, 144], [153, 151]]) }, // 武夷
  { kind: "ridge", width: 3, points: pts([[138, 24], [150, 26], [160, 30]]) }, // 燕山
  { kind: "ridge", width: 3, points: pts([[147, 65], [150, 67]]) }, // 泰山
  // 森林
  { kind: "forest", radius: 4, points: pts([[128, 74]]) }, // 野猪林
  { kind: "forest", radius: 6, points: pts([[150, 128]]) },
  { kind: "forest", radius: 5, points: pts([[98, 132]]) },
  { kind: "forest", radius: 4, points: pts([[150, 32]]) },
  { kind: "forest", radius: 7, points: pts([[48, 142]]) },
  { kind: "forest", radius: 5, points: pts([[108, 166]]) },
  { kind: "forest", radius: 4, points: pts([[140, 142]]) },
  { kind: "forest", radius: 4, points: pts([[60, 120]]) },
  { kind: "forest", radius: 3, points: pts([[168, 60]]) },
  { kind: "forest", radius: 4, points: pts([[86, 62]]) },
  // 水泊
  { kind: "marsh", radius: 4, points: pts([[136, 70]]) },
];

// 海岸線（この線の東・南は海。北から南へ）
export const COAST_POINTS: Array<[number, number]> = pts([
  [146, 0], [146, 6], [158, 18], [168, 30], [164, 38], [152, 44],
  [158, 50], [176, 46], [188, 54], [178, 60], [170, 68], [166, 80],
  [164, 92], [168, 100], [166, 106], [172, 110], [178, 122], [180, 130],
  [170, 140], [162, 152], [148, 162], [134, 170], [120, 176], [104, 176],
  [84, 172], [70, 168], [64, 176], [64, 184],
]);

// 北西の乾地（砂漠・高原）ポリゴン
export const DESERT_POINTS: Array<[number, number]> = pts([
  [0, 0], [64, 0], [48, 36], [24, 52], [0, 58],
]);

export interface FactionSeed {
  id: string;
  name: string;
  kind: FactionKind;
  leader: string;
  cities: string[];
  loc?: string;
  gold: number;
  policy: PolicyKind;
  corruption: number;
  legitimacy: number;
}

const COURT_CITIES = PLACE_SEEDS.filter((p) => p.owner === C).map((p) => p.id);

export const FACTION_SEEDS: FactionSeed[] = [
  {
    id: "court", name: "宋朝官府", kind: "court", leader: "gao-qiu",
    cities: COURT_CITIES,
    gold: 20000, policy: "develop", corruption: 78, legitimacy: 80,
  },
  {
    id: "fangla", name: "方臘軍", kind: "warlord", leader: "fang-la",
    cities: ["hangzhou", "muzhou", "shezhou"],
    gold: 4000, policy: "expand", corruption: 35, legitimacy: 32,
  },
  {
    id: "tianhu", name: "田虎軍", kind: "warlord", leader: "tian-hu",
    cities: ["weisheng", "longde"],
    gold: 2600, policy: "expand", corruption: 45, legitimacy: 28,
  },
  {
    id: "wangqing", name: "王慶軍", kind: "warlord", leader: "wang-qing",
    cities: ["fangzhou", "junzhou"],
    gold: 2200, policy: "expand", corruption: 50, legitimacy: 25,
  },
  {
    id: "zhu", name: "祝家荘", kind: "manor", leader: "zhu-chaofeng",
    cities: ["zhujiazhuang"], gold: 2500, policy: "defend", corruption: 40, legitimacy: 45,
  },
  {
    id: "zeng", name: "曾頭市", kind: "manor", leader: "zeng-nong",
    cities: ["zengtou"], gold: 2200, policy: "defend", corruption: 45, legitimacy: 40,
  },
  {
    id: "liangshan-band", name: "梁山泊", kind: "outlaw", leader: "wang-lun",
    cities: ["liangshan"], gold: 600, policy: "recruit", corruption: 20, legitimacy: 25,
  },
  {
    id: "taohua-band", name: "桃花山", kind: "outlaw", leader: "li-zhong",
    cities: ["taohua"], gold: 300, policy: "raid", corruption: 25, legitimacy: 15,
  },
];

// 流刑の護送先（水滸伝の定番、滄州牢城）
export const EXILE_DESTINATION = "cangzhou";

// 元号。世界の暦の見出しに使う
export const ERA_NAME = "宣和";

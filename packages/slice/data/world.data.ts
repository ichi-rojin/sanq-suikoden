// 責務: 縮小世界の地理・初期勢力データ（山東の一隅、11拠点）。固有名詞はこのdata層のみに置く
import type { Edge, FactionKind, PlaceKind, PolicyKind } from "../src/model";

export interface PlaceSeed {
  id: string;
  name: string;
  kind: PlaceKind;
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

export const PLACE_SEEDS: PlaceSeed[] = [
  {
    id: "jizhou", name: "済州府", kind: "capital",
    wealth: 85, population: 90, order: 55, sentiment: 40, defense: 80, garrison: 3200,
    owner: "court", terrainForest: 0.05, terrainCliff: 0, terrainWater: 0.1,
  },
  {
    id: "yuncheng", name: "鄆城県", kind: "county",
    wealth: 55, population: 60, order: 50, sentiment: 50, defense: 45, garrison: 900,
    owner: "court", terrainForest: 0.1, terrainCliff: 0, terrainWater: 0.15,
  },
  {
    id: "yanggu", name: "陽穀県", kind: "county",
    wealth: 50, population: 55, order: 45, sentiment: 45, defense: 40, garrison: 800,
    owner: "court", terrainForest: 0.15, terrainCliff: 0.05, terrainWater: 0,
  },
  {
    id: "yizhou", name: "沂州県", kind: "county",
    wealth: 45, population: 50, order: 40, sentiment: 42, defense: 42, garrison: 850,
    owner: "court", terrainForest: 0.2, terrainCliff: 0.1, terrainWater: 0,
  },
  {
    id: "zhujiazhuang", name: "祝家荘", kind: "manor",
    wealth: 65, population: 45, order: 70, sentiment: 55, defense: 60, garrison: 1600,
    owner: "zhu", terrainForest: 0.2, terrainCliff: 0, terrainWater: 0.1,
  },
  {
    id: "zengtou", name: "曾頭市", kind: "manor",
    wealth: 60, population: 40, order: 65, sentiment: 50, defense: 55, garrison: 1400,
    owner: "zeng", terrainForest: 0.15, terrainCliff: 0.1, terrainWater: 0,
  },
  {
    id: "liangshan", name: "梁山泊", kind: "marsh",
    wealth: 20, population: 15, order: 30, sentiment: 60, defense: 55, garrison: 300,
    owner: "liangshan-band", terrainForest: 0.25, terrainCliff: 0, terrainWater: 0.5,
  },
  {
    id: "erlong", name: "二龍山", kind: "lairsite",
    wealth: 12, population: 8, order: 25, sentiment: 50, defense: 50, garrison: 0,
    terrainForest: 0.45, terrainCliff: 0.3, terrainWater: 0,
  },
  {
    id: "taohua", name: "桃花山", kind: "lairsite",
    wealth: 10, population: 8, order: 25, sentiment: 48, defense: 42, garrison: 250,
    owner: "taohua-band", terrainForest: 0.4, terrainCliff: 0.25, terrainWater: 0,
  },
  {
    id: "yezhulin", name: "野猪林", kind: "pass",
    wealth: 5, population: 3, order: 20, sentiment: 50, defense: 10, garrison: 0,
    terrainForest: 0.7, terrainCliff: 0.05, terrainWater: 0.05,
  },
  {
    id: "dongxi", name: "東渓村", kind: "town",
    wealth: 30, population: 30, order: 45, sentiment: 60, defense: 20, garrison: 150,
    owner: "court", terrainForest: 0.2, terrainCliff: 0, terrainWater: 0.2,
  },
];

export const EDGE_SEEDS: Edge[] = [
  { from: "jizhou", to: "yuncheng" },
  { from: "jizhou", to: "yanggu" },
  { from: "jizhou", to: "yezhulin" },
  { from: "jizhou", to: "zhujiazhuang" },
  { from: "yuncheng", to: "dongxi" },
  { from: "yuncheng", to: "liangshan" },
  { from: "yuncheng", to: "zhujiazhuang" },
  { from: "yanggu", to: "zengtou" },
  { from: "yanggu", to: "erlong" },
  { from: "yizhou", to: "yezhulin" },
  { from: "yizhou", to: "taohua" },
  { from: "yizhou", to: "zengtou" },
  { from: "zhujiazhuang", to: "liangshan" },
  { from: "liangshan", to: "dongxi" },
  { from: "yezhulin", to: "erlong" },
];

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

export const FACTION_SEEDS: FactionSeed[] = [
  {
    id: "court", name: "宋朝官府", kind: "court", leader: "murong",
    cities: ["jizhou", "yuncheng", "yanggu", "yizhou", "dongxi"],
    gold: 5000, policy: "develop", corruption: 72, legitimacy: 75,
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

// 流刑の護送先（府から街道の難所を経て牢城へ至る）
export const EXILE_DESTINATION = "yizhou";

// 元号。世界の暦の見出しに使う
export const ERA_NAME = "宣和";

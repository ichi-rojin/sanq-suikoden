// 責務: Vertical Slice全域の型定義（武将・勢力・拠点・軍・戦場・イベント・世界状態）。固有名詞はdata層に置きsrcはIDのみ扱う
// 裁定R-17: 世界はグラフではなく200×200のTileMap。tickは1日。全ての実体はタイル座標を持つ
import type { CityWalls, WorldGrid, XY } from "./grid";
import type { Rng } from "./rng";

// ---- 基礎 ----
export type OfficerId = string;
export type FactionId = string;
export type PlaceId = string;
export type EventId = string;

export interface Aptitudes {
  valor: number;
  intellect: number;
  leadership: number;
  charisma: number;
  craft: number;
}

export interface Values {
  altruism: number;
  loyalty: number;
  ambition: number;
  acquisition: number;
  aggression: number;
  caution: number;
  face: number;
  attachment: number;
}

// 技は必ず戦場と世界へ影響を残す（ダメージは副産物）
export type SkillId =
  | "charge" // 敵を吹き飛ばす突進
  | "volley" // 矢の雨。流れ矢が第三者へ当たる
  | "fire" // 火攻め。延焼し地形を焼き払う
  | "sorcery" // 複数セルへ及ぶ妖しき術
  | "rockfall" // 崖を崩し地形そのものを変える
  | "ambush" // 林へ潜み奇襲する
  | "taunt"; // 敵将のふるまいを書き換える

export type BondKind = "sworn" | "master" | "kin" | "colleague";

export interface Relation {
  affinity: number; // -100..100
  trust: number; // 0..100
  bond?: BondKind;
  grudges: EventId[]; // 怨恨の原因イベント（因果保存）
  debts: EventId[]; // 恩義の原因イベント
}

export type OfficerStatus = "serving" | "roaming" | "free" | "prisoner" | "dead";

// 旅程: 世界をタイル単位で歩む（武将・護送・放浪の一党が共有する移動機構）
export interface Journey {
  path: XY[]; // 残りの行程（先頭が次の一歩）
  dest: PlaceId; // 目的地
  mp: number; // 蓄積した移動力
  speed: number; // 1日に得る移動力
}

export interface Officer {
  id: OfficerId;
  age: number;
  aptitudes: Aptitudes;
  values: Values;
  skills: SkillId[];
  hp: number; // 0..100
  status: OfficerStatus;
  factionId?: FactionId;
  loc: PlaceId; // 直近に身を置いた拠点（旅の間は出発地のまま）
  homeLoc: PlaceId;
  pos: XY; // 世界タイル上の現在地
  journey?: Journey; // 旅の途中なら存在する
  fameOfficial: number; // 官の名声
  fameOutlaw: number; // 江湖の名声
  gold: number;
  rel: Map<OfficerId, Relation>;
  memory: EventId[]; // 人生年表（列伝の原資料）
  deathTick?: number;
}

export type PlaceKind =
  | "capital" // 府クラスの大都市
  | "county" // 中規模都市
  | "town" // 村鎮
  | "manor" // 豪族の荘園
  | "lairsite" // 山塞を築ける要害
  | "marsh" // 水郷の要害
  | "pass" // 街道の難所（林が深い）
  | "port"; // 渡河・海運の要衝（無主の中継点）

export interface Place {
  id: PlaceId;
  kind: PlaceKind;
  gridX: number; // 世界タイル上の中心座標
  gridY: number;
  wealth: number;
  population: number;
  order: number; // 治安
  sentiment: number; // 民心
  defense: number;
  garrison: number; // 駐留兵
  owner?: FactionId;
  devastation: number; // 戦火の傷跡（恒久的な世界変化）
  gateHp: number; // 城門の残り強度（城郭都市のみ意味を持つ）
  gateBroken: boolean;
  terrainForest: number; // 0..1 周辺地勢の重み（データ由来の趣）
  terrainCliff: number;
  terrainWater: number;
}

// 街道の骨格（タイル街道を敷くための設計線。移動はタイルで行う）
export interface Edge {
  from: PlaceId;
  to: PlaceId;
}

export type FactionKind =
  | "court" // 王朝の地方政庁
  | "warlord" // 城市を持つ独立勢力
  | "manor" // 私兵を抱える豪族
  | "outlaw" // 要害に拠る緑林勢力
  | "roaming"; // 領地なき放浪の一党

export type PolicyKind = "expand" | "defend" | "recruit" | "develop" | "suppress" | "raid" | "seeklair";

export interface Faction {
  id: FactionId;
  kind: FactionKind;
  leader: OfficerId;
  members: OfficerId[];
  cities: PlaceId[];
  loc?: PlaceId; // 放浪時の現在地
  gold: number;
  policy: PolicyKind;
  corruption: number;
  legitimacy: number;
  feud: Map<FactionId, number>; // 勢力間の敵意
  foundedTick: number;
  fallenTick?: number;
}

export type ArmyGoal = "invade" | "suppress";
export type ArmyState = "march" | "fight" | "retreat";

// 軍の一隊: 武将が率いる兵。交戦中は各隊が世界タイル上に散開する
export interface ArmyUnit {
  officerId: OfficerId;
  x: number;
  y: number;
  troops: number;
  troopsMax: number;
  morale: number;
  hidden: boolean; // 伏兵として林に潜んでいる
  tauntTicks: number;
  tauntTargetId?: OfficerId;
  routed: boolean;
  gone: boolean; // 離脱・捕縛・戦死で戦場から消えた
  skillCooldowns: Map<SkillId, number>; // 技→再使用可能になるtick（多日にわたる攻城戦でも技が涸れない）
}

export interface Army {
  id: string;
  factionId: FactionId;
  units: ArmyUnit[];
  x: number; // 軍旗（行軍時の隊列位置）
  y: number;
  mp: number;
  path: XY[]; // 残りの行程（タイル列）
  trail: XY[]; // 直近に踏んだタイル（描画の兵列用）
  target: PlaceId;
  goal: ArmyGoal;
  state: ArmyState;
  battleId?: string;
  causeEvent: EventId;
}

// 流刑の護送隊。街道の難所で仲間の奪還が起こり得る
export interface Convoy {
  prisoner: OfficerId;
  x: number;
  y: number;
  path: XY[];
  mp: number;
  dest: PlaceId;
  escortFactionId: FactionId;
  causeEvent: EventId;
}

// 交戦: 世界そのものが戦場。多勢力が同じ戦場に途中参加・離脱できる
export interface Battle {
  id: string;
  startTick: number;
  x: number; // 重心（毎日更新。カメラ追跡と描画に使う）
  y: number;
  factions: FactionId[];
  placeId?: PlaceId; // 攻城戦なら対象都市
  siege: boolean;
  eventId: EventId;
  lastClashTick: number;
  duelPairs: string[]; // 立ち合い済みの対（同じ二人が同じ戦場で二度は立ち合わない）
}

// 持続する矢の雨（世界タイル上の投射物）
export interface VolleyField {
  cells: XY[];
  left: number;
  shooterId: OfficerId;
  factionId: FactionId;
  causeEvent: EventId;
}

// 戦場の亡骸（世界に残る痕跡。描画用）
export interface Corpse {
  x: number;
  y: number;
  tick: number;
}

// 小窓ドラマ: 世界の中の人間の一幕。世界は止まらず、カメラだけが寄る
export type DramaKind =
  | "duel" // 一騎討ち
  | "oath" // 義兄弟の契り
  | "execution" // 処刑
  | "rescue" // 護送の奪還・劫牢
  | "feast" // 酒宴
  | "frame" // 冤罪の讒訴
  | "parley"; // 説得・帰順

export interface DramaBeat {
  speaker?: OfficerId;
  key: string; // 台詞鍵（文章化はdata層）
}

export interface Drama {
  id: string;
  tick: number;
  kind: DramaKind;
  at: XY;
  loc?: PlaceId;
  actors: OfficerId[];
  eventIds: EventId[];
  beats: DramaBeat[];
}

export interface WorldEvent {
  id: EventId;
  tick: number;
  kind: string;
  loc?: PlaceId;
  at?: XY; // 世界タイル上の発生地点（拠点の外の出来事を地図に置く）
  actors: OfficerId[];
  factions: FactionId[];
  causes: EventId[]; // 因果保存原則: 全イベントは原因を持ち得る
  data: Record<string, unknown>;
  sig: number; // 編年史採録の重み
}

export interface World {
  tick: number; // 1 tick = 1日
  rng: Rng;
  grid: WorldGrid;
  walls: Map<PlaceId, CityWalls>;
  cityTiles: Map<number, PlaceId>; // タイルidx → その敷地を持つ拠点（延焼・攻城の帰属判定）
  wind: XY; // 月ごとに変わる風向（延焼と煙が従う）
  exileDest: PlaceId; // 流刑の護送先
  officers: Map<OfficerId, Officer>;
  factions: Map<FactionId, Faction>;
  places: Map<PlaceId, Place>;
  edges: Edge[];
  armies: Army[];
  convoys: Convoy[];
  battles: Battle[];
  volleys: VolleyField[];
  corpses: Corpse[];
  events: WorldEvent[];
  dramas: Drama[];
  counters: Map<string, number>;
}

// 名前解決はdata層が実装する（srcは固有名詞を持たない）
// 勢力名は改名履歴を持ち、tick指定でその時点の名を返す（歴史の遡及汚染を防ぐ）
export interface NameRegistry {
  officer(id: OfficerId): string;
  officerShort(id: OfficerId): string;
  faction(id: FactionId, tick?: number): string;
  place(id: PlaceId): string;
  registerBand(factionId: FactionId, leaderId: OfficerId, tick: number): void;
  registerLair(factionId: FactionId, placeId: PlaceId, tick: number): void;
  yearLabel(year: number): string;
  monthLabel(month: number): string;
}

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export function yearOf(tick: number): number {
  return Math.floor(tick / DAYS_PER_YEAR);
}

export function monthOf(tick: number): number {
  return (Math.floor(tick / DAYS_PER_MONTH) % MONTHS_PER_YEAR) + 1;
}

export function dayOf(tick: number): number {
  return (tick % DAYS_PER_MONTH) + 1;
}

export function nextId(world: World, prefix: string): string {
  const current = world.counters.get(prefix) ?? 0;
  world.counters.set(prefix, current + 1);
  return `${prefix}-${current + 1}`;
}

export function placePos(world: World, placeId: PlaceId): XY {
  const place = world.places.get(placeId);
  return place === undefined ? { x: 0, y: 0 } : { x: place.gridX, y: place.gridY };
}

export function neighborsOf(world: World, place: PlaceId): PlaceId[] {
  const result: PlaceId[] = [];
  for (const edge of world.edges) {
    if (edge.from === place) {
      result.push(edge.to);
    } else if (edge.to === place) {
      result.push(edge.from);
    }
  }
  return result;
}

// 拠点間の戦略距離（街道の骨格を幅優先。AIの土地勘に使う。実移動はタイル経路）
export function findPath(world: World, from: PlaceId, to: PlaceId): PlaceId[] {
  if (from === to) {
    return [];
  }
  const prev = new Map<PlaceId, PlaceId>();
  const queue: PlaceId[] = [from];
  const seen = new Set<PlaceId>([from]);
  while (queue.length > 0) {
    const cur = queue.shift() as PlaceId;
    for (const nb of neighborsOf(world, cur)) {
      if (seen.has(nb)) {
        continue;
      }
      seen.add(nb);
      prev.set(nb, cur);
      if (nb === to) {
        const path: PlaceId[] = [to];
        let walker: PlaceId = to;
        while (prev.get(walker) !== undefined && prev.get(walker) !== from) {
          walker = prev.get(walker) as PlaceId;
          path.unshift(walker);
        }
        return path;
      }
      queue.push(nb);
    }
  }
  return [];
}

export function distanceBetween(world: World, from: PlaceId, to: PlaceId): number {
  if (from === to) {
    return 0;
  }
  const path = findPath(world, from, to);
  return path.length === 0 ? Number.POSITIVE_INFINITY : path.length;
}

export function livingOfficers(world: World): Officer[] {
  return [...world.officers.values()].filter((o) => o.status !== "dead");
}

// その拠点に「腰を落ち着けている」武将（旅の途中の者は含まない）
export function officersAt(world: World, place: PlaceId): Officer[] {
  return livingOfficers(world).filter(
    (o) => o.loc === place && o.journey === undefined && o.status !== "prisoner",
  );
}

export function factionOf(world: World, officer: Officer): Faction | undefined {
  return officer.factionId === undefined ? undefined : world.factions.get(officer.factionId);
}

export function powerOf(officer: Officer): number {
  const a = officer.aptitudes;
  return a.valor * 0.4 + a.leadership * 0.35 + a.intellect * 0.15 + a.craft * 0.1;
}

export function factionStrength(world: World, faction: Faction): number {
  const officerPower = faction.members
    .map((id) => world.officers.get(id))
    .filter((o): o is Officer => o !== undefined && o.status !== "dead")
    .reduce((sum, o) => sum + powerOf(o), 0);
  const troops = faction.cities.reduce((sum, cid) => sum + (world.places.get(cid)?.garrison ?? 0), 0);
  const bandTroops = faction.cities.length === 0 ? faction.members.length * 60 : 0;
  return officerPower * 10 + troops + bandTroops;
}

export function armyOfficerIds(army: Army): OfficerId[] {
  return army.units.map((u) => u.officerId);
}

export function armyTroops(army: Army): number {
  return army.units.reduce((sum, u) => sum + (u.gone ? 0 : u.troops), 0);
}

export function getRelation(officer: Officer, target: OfficerId): Relation {
  let rel = officer.rel.get(target);
  if (rel === undefined) {
    rel = { affinity: 0, trust: 30, grudges: [], debts: [] };
    officer.rel.set(target, rel);
  }
  return rel;
}

export function grudgeScore(officer: Officer, target: OfficerId): number {
  const rel = officer.rel.get(target);
  if (rel === undefined) {
    return 0;
  }
  return rel.grudges.length * 25 + Math.max(0, -rel.affinity) * 0.5;
}

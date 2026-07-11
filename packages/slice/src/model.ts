// 責務: Vertical Slice全域の型定義（武将・勢力・拠点・イベント・世界状態）。固有名詞はdata層に置きsrcはIDのみ扱う
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

export interface Officer {
  id: OfficerId;
  age: number;
  aptitudes: Aptitudes;
  values: Values;
  skills: SkillId[];
  hp: number; // 0..100
  status: OfficerStatus;
  factionId?: FactionId;
  loc: PlaceId;
  homeLoc: PlaceId;
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
  gridX: number; // 論理グリッド上の座標（可視化と地理表現に使う）
  gridY: number;
  wealth: number;
  population: number;
  order: number; // 治安
  sentiment: number; // 民心
  defense: number;
  garrison: number; // 駐留兵
  owner?: FactionId;
  devastation: number; // 戦火の傷跡（恒久的な世界変化）
  terrainForest: number; // 0..1 戦場生成の重み
  terrainCliff: number;
  terrainWater: number;
}

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

export interface Army {
  id: string;
  factionId: FactionId;
  officers: OfficerId[];
  troops: number;
  loc: PlaceId;
  path: PlaceId[]; // 残りの行程
  target: PlaceId;
  goal: ArmyGoal;
  causeEvent: EventId;
}

// 流刑の護送隊。街道の難所で仲間の奪還が起こり得る
export interface Convoy {
  prisoner: OfficerId;
  loc: PlaceId;
  path: PlaceId[];
  escortFactionId: FactionId;
  causeEvent: EventId;
}

export interface WorldEvent {
  id: EventId;
  tick: number;
  kind: string;
  loc?: PlaceId;
  actors: OfficerId[];
  factions: FactionId[];
  causes: EventId[]; // 因果保存原則: 全イベントは原因を持ち得る
  data: Record<string, unknown>;
  sig: number; // 編年史採録の重み
}

export interface BattleReplayFrame {
  tick: number;
  grid: string[]; // 描画済みの各行
  notes: string[];
}

// リプレイ盤面の記号と武将の対応（Viewer描画用）
export interface BattleReplayUnit {
  glyph: string;
  officerId: OfficerId;
  side: 0 | 1;
}

export interface BattleReplay {
  id: string;
  tick: number;
  loc: PlaceId;
  attackerFaction: FactionId;
  defenderFaction: FactionId;
  siege: boolean;
  units: BattleReplayUnit[];
  frames: BattleReplayFrame[];
  eventIds: EventId[];
}

export interface World {
  tick: number;
  rng: Rng;
  exileDest: PlaceId; // 流刑の護送先
  officers: Map<OfficerId, Officer>;
  factions: Map<FactionId, Faction>;
  places: Map<PlaceId, Place>;
  edges: Edge[];
  armies: Army[];
  convoys: Convoy[];
  events: WorldEvent[];
  replays: BattleReplay[];
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

export const MONTHS_PER_YEAR = 12;

export function yearOf(tick: number): number {
  return Math.floor(tick / MONTHS_PER_YEAR);
}

export function monthOf(tick: number): number {
  return (tick % MONTHS_PER_YEAR) + 1;
}

export function nextId(world: World, prefix: string): string {
  const current = world.counters.get(prefix) ?? 0;
  world.counters.set(prefix, current + 1);
  return `${prefix}-${current + 1}`;
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

// 幅優先で最短経路（出発地を除き到着地を含む）
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

export function officersAt(world: World, place: PlaceId): Officer[] {
  return livingOfficers(world).filter((o) => o.loc === place && o.status !== "prisoner");
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

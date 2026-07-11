// 責務: 全国戦場TileMap（裁定R-17）。地形の生成・通行判定・A*経路探索・世界の傷跡（延焼跡・瓦礫）の管理
// 世界はグラフではなくタイルの連なりである。街道は「移動速度補正を持つタイル」、河は壁、渡し場と関が扉になる

export interface XY {
  x: number;
  y: number;
}

// 地形コード（Uint8Array格納）
export const T = {
  plain: 0,
  road: 1, // 街道: 最速の地表
  forest: 2,
  mountain: 3, // 通行不能。関の回廊（road化）でのみ越えられる
  river: 4, // 通行不能。渡し場（ford）でのみ越えられる
  ford: 5, // 渡河点
  marsh: 6, // 水郷: 遅いが通れる
  dry: 7, // 乾地・砂漠
  sea: 8, // 海: 通行不能
  city: 9, // 都市の敷地
  wall: 10, // 城壁: 通行不能
  gate: 11, // 城門・関門: 開いていれば通れる
  burnt: 12, // 焼け跡（延焼の恒久痕。時とともに癒える）
  rubble: 13, // 瓦礫（崖崩れ・崩壁。道を塞ぐ）
} as const;

export type TerrainCode = (typeof T)[keyof typeof T];

// 1日の移動力を1.0とした時の、タイル1歩の消費（Infinity=通行不能）
const MOVE_COST: Record<number, number> = {
  [T.plain]: 0.6,
  [T.road]: 0.34,
  [T.forest]: 1.15,
  [T.mountain]: Number.POSITIVE_INFINITY,
  [T.river]: Number.POSITIVE_INFINITY,
  [T.ford]: 0.8,
  [T.marsh]: 1.4,
  [T.dry]: 0.75,
  [T.sea]: Number.POSITIVE_INFINITY,
  [T.city]: 0.45,
  [T.wall]: Number.POSITIVE_INFINITY,
  [T.gate]: 0.6,
  [T.burnt]: 0.65,
  [T.rubble]: Number.POSITIVE_INFINITY,
};

export function moveCostOf(t: number): number {
  return MOVE_COST[t] ?? 0.6;
}

export function isFlammable(t: number): boolean {
  return t === T.forest || t === T.plain || t === T.city || t === T.gate || t === T.road || t === T.marsh;
}

// 延焼のしやすさ（森は激しく、湿地は燃えにくい）
export function burnRate(t: number): number {
  switch (t) {
    case T.forest:
      return 0.42;
    case T.city:
      return 0.3;
    case T.gate:
      return 0.3;
    case T.plain:
      return 0.12;
    case T.road:
      return 0.08;
    case T.marsh:
      return 0.04;
    default:
      return 0;
  }
}

export interface Scar {
  kind: "burnt" | "rubble";
  tick: number;
  prev: number; // 元の地形コード（癒えた時に戻す）
}

export interface FireCell {
  left: number; // 残り燃焼日数
  causeEvent: string;
  igniterId?: string; // 火元の武将（延焼被害の怨恨先）
}

export class WorldGrid {
  readonly w: number;
  readonly h: number;
  readonly terrain: Uint8Array;
  readonly fires = new Map<number, FireCell>(); // idx → 燃焼状態
  readonly scars = new Map<number, Scar>(); // idx → 傷跡（時とともに癒える）
  readonly dirty: number[] = []; // 描画側が差分再描画するための変更idxキュー

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.terrain = new Uint8Array(w * h);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  xyOf(idx: number): XY {
    return { x: idx % this.w, y: Math.floor(idx / this.w) };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  at(x: number, y: number): number {
    if (!this.inBounds(x, y)) {
      return T.sea;
    }
    return this.terrain[this.idx(x, y)] as number;
  }

  set(x: number, y: number, t: TerrainCode): void {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.idx(x, y);
    if (this.terrain[i] !== t) {
      this.terrain[i] = t;
      this.dirty.push(i);
    }
  }

  passable(x: number, y: number): boolean {
    return Number.isFinite(moveCostOf(this.at(x, y)));
  }

  // 傷跡を刻む（焼け跡・瓦礫）。元地形を覚えておき、月日が癒す
  scar(x: number, y: number, kind: Scar["kind"], tick: number): void {
    if (!this.inBounds(x, y)) {
      return;
    }
    const i = this.idx(x, y);
    const prevT = this.terrain[i] as number;
    if (prevT === T.sea || prevT === T.river || prevT === T.wall) {
      return;
    }
    if (!this.scars.has(i)) {
      this.scars.set(i, { kind, tick, prev: prevT === T.burnt || prevT === T.rubble ? T.plain : prevT });
    }
    this.set(x, y, kind === "burnt" ? T.burnt : T.rubble);
  }

  // 傷は癒える: 瓦礫は約半年で啓開され、焼け跡は約2年で野に戻る
  healScars(tick: number): void {
    for (const [i, scar] of this.scars) {
      const age = tick - scar.tick;
      const span = scar.kind === "rubble" ? 180 : 720;
      if (age >= span) {
        this.scars.delete(i);
        const { x, y } = this.xyOf(i);
        const back = scar.prev === T.forest ? T.plain : scar.prev; // 森は一世代では戻らない
        this.set(x, y, back as TerrainCode);
      }
    }
  }
}

// ---- 直線・図形のラスタライズ ----

function stampDisc(grid: WorldGrid, cx: number, cy: number, r: number, t: TerrainCode, only?: (cur: number) => boolean): void {
  const rr = Math.ceil(r);
  for (let y = cy - rr; y <= cy + rr; y += 1) {
    for (let x = cx - rr; x <= cx + rr; x += 1) {
      if (!grid.inBounds(x, y)) {
        continue;
      }
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        if (only === undefined || only(grid.at(x, y))) {
          grid.set(x, y, t);
        }
      }
    }
  }
}

function stampPolyline(
  grid: WorldGrid,
  points: ReadonlyArray<[number, number]>,
  width: number,
  t: TerrainCode,
  only?: (cur: number) => boolean,
): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[i + 1] as [number, number];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s += 1) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      stampDisc(grid, Math.round(x), Math.round(y), Math.max(0.5, width / 2), t, only);
    }
  }
}

// 多角形の塗り（走査線）。海・乾地の面を敷く
function fillPolygon(grid: WorldGrid, points: ReadonlyArray<[number, number]>, t: TerrainCode): void {
  for (let y = 0; y < grid.h; y += 1) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x0, y0] = points[i] as [number, number];
      const [x1, y1] = points[(i + 1) % points.length] as [number, number];
      if (y0 === y1) {
        continue;
      }
      if ((y >= Math.min(y0, y1) && y < Math.max(y0, y1))) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] as number));
      const to = Math.min(grid.w - 1, Math.floor(xs[k + 1] as number));
      for (let x = from; x <= to; x += 1) {
        grid.set(x, y, t);
      }
    }
  }
}

// ---- A* 経路探索（8方向・二分ヒープ） ----

class Heap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.keys[p] as number) <= (this.keys[i] as number)) {
        break;
      }
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.vals[0] as number;
    const lastKey = this.keys.pop() as number;
    const lastVal = this.vals.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.vals[0] = lastVal;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && (this.keys[l] as number) < (this.keys[m] as number)) {
          m = l;
        }
        if (r < this.keys.length && (this.keys[r] as number) < (this.keys[m] as number)) {
          m = r;
        }
        if (m === i) {
          break;
        }
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a] as number;
    this.keys[a] = this.keys[b] as number;
    this.keys[b] = k;
    const v = this.vals[a] as number;
    this.vals[a] = this.vals[b] as number;
    this.vals[b] = v;
  }
}

const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41],
];

export type TileCostFn = (t: number, x: number, y: number) => number;

// from から to への経路（fromを除き、toを含む）。到達不能なら undefined
export function findTilePath(
  grid: WorldGrid,
  from: XY,
  to: XY,
  costFn: TileCostFn = (t) => moveCostOf(t),
): XY[] | undefined {
  const w = grid.w;
  const start = grid.idx(from.x, from.y);
  const goal = grid.idx(to.x, to.y);
  if (start === goal) {
    return [];
  }
  const gScore = new Float64Array(grid.terrain.length).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(grid.terrain.length).fill(-1);
  gScore[start] = 0;
  const open = new Heap();
  const hx = (i: number): number => {
    const x = i % w;
    const y = Math.floor(i / w);
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    // 8方向オクタイル距離 × 最小コスト
    return (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)) * 0.34;
  };
  open.push(hx(start), start);
  const closed = new Uint8Array(grid.terrain.length);

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) {
      const path: XY[] = [];
      let walker = goal;
      while (walker !== start && walker !== -1) {
        path.push(grid.xyOf(walker));
        walker = prev[walker] as number;
      }
      return path.reverse();
    }
    if (closed[cur] === 1) {
      continue;
    }
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, mul] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) {
        continue;
      }
      const ni = ny * w + nx;
      if (closed[ni] === 1) {
        continue;
      }
      const stepCost = costFn(grid.terrain[ni] as number, nx, ny) * mul;
      if (!Number.isFinite(stepCost)) {
        continue;
      }
      const tentative = (gScore[cur] as number) + stepCost;
      if (tentative < (gScore[ni] as number)) {
        gScore[ni] = tentative;
        prev[ni] = cur;
        open.push(tentative + hx(ni), ni);
      }
    }
  }
  return undefined;
}

// 経路の総移動コスト（日数の見積り = コスト / 1日の移動力）
export function pathCost(grid: WorldGrid, from: XY, path: readonly XY[]): number {
  let total = 0;
  let px = from.x;
  let py = from.y;
  for (const step of path) {
    const mul = step.x !== px && step.y !== py ? 1.41 : 1;
    total += moveCostOf(grid.at(step.x, step.y)) * mul;
    px = step.x;
    py = step.y;
  }
  return total;
}

// 最寄りの通行可能タイル（配置補正用）
export function nearestPassable(grid: WorldGrid, x: number, y: number): XY {
  if (grid.passable(x, y)) {
    return { x, y };
  }
  for (let r = 1; r < 12; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
          continue;
        }
        if (grid.passable(x + dx, y + dy)) {
          return { x: x + dx, y: y + dy };
        }
      }
    }
  }
  return { x, y };
}

export function chebyshev(a: XY, b: XY): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// ---- 世界地形の組み立て ----

export interface GeoFeatureLike {
  kind: "river" | "canal" | "ridge" | "forest" | "marsh";
  points: Array<[number, number]>;
  width?: number;
  radius?: number;
}

export interface PlaceFootprint {
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface GridSeed {
  w: number;
  h: number;
  geo: GeoFeatureLike[];
  coast: Array<[number, number]>;
  desert: Array<[number, number]>;
  places: PlaceFootprint[];
  edges: Array<{ from: string; to: string }>;
}

export interface CityWalls {
  gates: XY[]; // 城門タイル
  ring: XY[]; // 城壁タイル
}

export interface BuiltGrid {
  grid: WorldGrid;
  walls: Map<string, CityWalls>; // 城郭都市の門と壁
}

const WALLED_KINDS = new Set(["capital", "county", "manor"]);

export function buildGrid(seed: GridSeed): BuiltGrid {
  const grid = new WorldGrid(seed.w, seed.h);

  // 1) 乾地 → 森 → 山 → 水郷 → 河川 → 海 の順に地相を重ねる
  fillPolygon(grid, seed.desert, T.dry);
  for (const f of seed.geo) {
    if (f.kind === "forest") {
      const [cx, cy] = f.points[0] as [number, number];
      stampDisc(grid, cx, cy, f.radius ?? 4, T.forest);
    }
  }
  for (const f of seed.geo) {
    if (f.kind === "ridge") {
      stampPolyline(grid, f.points, f.width ?? 3, T.mountain);
    }
  }
  for (const f of seed.geo) {
    if (f.kind === "marsh") {
      const [cx, cy] = f.points[0] as [number, number];
      stampDisc(grid, cx, cy, f.radius ?? 4, T.marsh);
    }
  }
  for (const f of seed.geo) {
    if (f.kind === "river" || f.kind === "canal") {
      stampPolyline(grid, f.points, Math.max(1, f.width ?? 1.2), T.river);
    }
  }
  const seaPoly: Array<[number, number]> = [...seed.coast, [seed.w, seed.h], [seed.w, 0]];
  fillPolygon(grid, seaPoly, T.sea);

  // 2) 拠点の敷地。城郭都市は城壁と四門を持つ（攻城戦は世界地図の上で起きる）
  const walls = new Map<string, CityWalls>();
  const byId = new Map(seed.places.map((p) => [p.id, p]));
  for (const p of seed.places) {
    if (WALLED_KINDS.has(p.kind)) {
      const r = p.kind === "capital" ? 2 : 1;
      // 中庭
      for (let dy = -(r - 1); dy <= r - 1; dy += 1) {
        for (let dx = -(r - 1); dx <= r - 1; dx += 1) {
          grid.set(p.x + dx, p.y + dy, T.city);
        }
      }
      // 城壁の環と四門
      const ring: XY[] = [];
      const gates: XY[] = [];
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
            continue;
          }
          const x = p.x + dx;
          const y = p.y + dy;
          if (!grid.inBounds(x, y) || grid.at(x, y) === T.sea) {
            continue;
          }
          const isGate = (dx === 0 && Math.abs(dy) === r) || (dy === 0 && Math.abs(dx) === r);
          if (isGate) {
            grid.set(x, y, T.gate);
            gates.push({ x, y });
          } else {
            grid.set(x, y, T.wall);
            ring.push({ x, y });
          }
        }
      }
      walls.set(p.id, { gates, ring });
    } else if (p.kind === "pass") {
      grid.set(p.x, p.y, T.gate);
    } else {
      // 村鎮・山寨・港は一画の敷地
      grid.set(p.x, p.y, T.city);
    }
  }

  // 3) 街道: 各辺をA*で敷く。既存の街道を好み、渡河は港の近くを選ぶ（河は壁、港は扉）
  const portLike = seed.places.filter((p) => p.kind === "port");
  const nearPort = (x: number, y: number): boolean =>
    portLike.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 2);
  const layCost: TileCostFn = (t, x, y) => {
    switch (t) {
      case T.road:
        return 0.2;
      case T.ford:
        return 0.4;
      case T.gate:
      case T.city:
        return 0.5;
      case T.plain:
        return 1;
      case T.dry:
        return 1.1;
      case T.burnt:
        return 1;
      case T.forest:
        return 2.2;
      case T.marsh:
        return 3;
      case T.mountain:
        return 9; // 高価だが可: 自然と峠の回廊が定まる
      case T.river:
        return nearPort(x, y) ? 3 : 42; // 渡し場を強く好む。已む無き所には橋が架かる
      case T.wall:
      case T.sea:
        return Number.POSITIVE_INFINITY;
      default:
        return 1;
    }
  };
  for (const edge of seed.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (a === undefined || b === undefined) {
      continue;
    }
    const path = findTilePath(grid, { x: a.x, y: a.y }, { x: b.x, y: b.y }, layCost);
    if (path === undefined) {
      continue;
    }
    for (const step of path) {
      const cur = grid.at(step.x, step.y);
      if (cur === T.plain || cur === T.dry || cur === T.forest || cur === T.marsh || cur === T.burnt) {
        grid.set(step.x, step.y, T.road);
      } else if (cur === T.mountain) {
        grid.set(step.x, step.y, T.road); // 峠の回廊
      } else if (cur === T.river) {
        grid.set(step.x, step.y, T.ford); // 渡し場・橋
      }
    }
  }

  grid.dirty.length = 0;
  return { grid, walls };
}

// 責務: 勢力の支配領域を都市所有から推定する（Europa Universalis風の勢力図）。
// シムは都市単位の所有しか持たないため、全ての所有拠点を種として多発源BFSで塗り広げ、
// 海・山・河などシムが元々「通行不能」とする地形で自然に領域を区切る（新たな判定は作らない）
import type { World } from "../src/model";

export interface TerritoryResult {
  owner: Int16Array; // タイルidx（world.grid.idx相当）→ 勢力インデックス（-1=無所属）
  factionIds: string[]; // インデックス → factionId
  centroids: Map<string, { x: number; y: number }>; // factionId → 支配域重心（タイル座標）
}

export function computeTerritory(world: World): TerritoryResult {
  const grid = world.grid;
  const w = grid.w;
  const h = grid.h;
  const owner = new Int16Array(w * h).fill(-1);
  const factionIds: string[] = [];
  const factionIndex = new Map<string, number>();
  const queue = new Int32Array(w * h);
  let qlen = 0;

  for (const place of world.places.values()) {
    if (place.owner === undefined) {
      continue;
    }
    let fi = factionIndex.get(place.owner);
    if (fi === undefined) {
      fi = factionIds.length;
      factionIds.push(place.owner);
      factionIndex.set(place.owner, fi);
    }
    if (!grid.inBounds(place.gridX, place.gridY)) {
      continue;
    }
    const idx = grid.idx(place.gridX, place.gridY);
    if (owner[idx] === -1) {
      owner[idx] = fi;
      queue[qlen] = idx;
      qlen += 1;
    }
  }

  let head = 0;
  while (head < qlen) {
    const cur = queue[head] as number;
    head += 1;
    const fi = owner[cur] as number;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) {
        continue;
      }
      const ni = ny * w + nx;
      if (owner[ni] !== -1 || !grid.passable(nx, ny)) {
        continue;
      }
      owner[ni] = fi;
      queue[qlen] = ni;
      qlen += 1;
    }
  }

  const sums = new Map<string, { sx: number; sy: number; n: number }>();
  for (let i = 0; i < owner.length; i += 1) {
    const fi = owner[i] as number;
    if (fi === -1) {
      continue;
    }
    const fid = factionIds[fi] as string;
    const x = i % w;
    const y = Math.floor(i / w);
    const e = sums.get(fid) ?? { sx: 0, sy: 0, n: 0 };
    e.sx += x;
    e.sy += y;
    e.n += 1;
    sums.set(fid, e);
  }
  const centroids = new Map<string, { x: number; y: number }>();
  for (const [fid, e] of sums) {
    centroids.set(fid, { x: e.sx / e.n, y: e.sy / e.n });
  }

  return { owner, factionIds, centroids };
}

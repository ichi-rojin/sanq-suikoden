// 責務: 中国全土のタイル地形をオフスクリーンCanvasへ描画し、街道ポリライン（行軍経路）を算出する
import type { GeoFeature, PlaceSeed } from "../data/world.data";
import type { Edge } from "../src/model";
import { CELL, decoRand } from "./theme";

export interface TerrainResult {
  canvas: HTMLCanvasElement;
  roadPaths: Map<string, Array<[number, number]>>; // "from>to" → 画素座標ポリライン
}

export function edgeKey(a: string, b: string): string {
  return `${a}>${b}`;
}

function smoothPath(ctx: CanvasRenderingContext2D, points: Array<[number, number]>): void {
  if (points.length < 2) {
    return;
  }
  const first = points[0] as [number, number];
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[i + 1] as [number, number];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  const last = points[points.length - 1] as [number, number];
  ctx.lineTo(last[0], last[1]);
}

export function buildTerrain(
  gridW: number,
  gridH: number,
  places: readonly PlaceSeed[],
  edges: readonly Edge[],
  geo: readonly GeoFeature[],
  coast: ReadonlyArray<[number, number]>,
  desert: ReadonlyArray<[number, number]>,
): TerrainResult {
  const w = gridW * CELL;
  const h = gridH * CELL;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("canvas 2d context unavailable");
  }
  const px = (p: [number, number]): [number, number] => [p[0] * CELL, p[1] * CELL];

  // ---- 大地: 基調色とむら ----
  ctx.fillStyle = "#3f4f30";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i += 1) {
    const x = decoRand("land", i * 2) * w;
    const y = decoRand("land", i * 2 + 1) * h;
    const r = 12 + decoRand("landr", i) * 40;
    const tone = decoRand("landt", i);
    ctx.fillStyle = tone < 0.4 ? "rgba(90,110,60,0.16)" : tone < 0.7 ? "rgba(56,72,40,0.20)" : "rgba(120,125,80,0.10)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 北方は乾いた色へグラデーション
  const northFade = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  northFade.addColorStop(0, "rgba(150,130,80,0.45)");
  northFade.addColorStop(1, "rgba(150,130,80,0)");
  ctx.fillStyle = northFade;
  ctx.fillRect(0, 0, w, h * 0.4);

  // ---- 北西の乾地 ----
  ctx.beginPath();
  const d0 = px(desert[0] as [number, number]);
  ctx.moveTo(d0[0], d0[1]);
  for (const p of desert.slice(1)) {
    const [x, y] = px(p);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#8d7c55";
  ctx.fill();
  for (let i = 0; i < 120; i += 1) {
    const x = decoRand("dune", i * 2) * w * 0.3;
    const y = decoRand("dune", i * 2 + 1) * h * 0.3;
    ctx.fillStyle = "rgba(120,100,66,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + decoRand("duner", i) * 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 森林 ----
  for (const f of geo) {
    if (f.kind !== "forest") {
      continue;
    }
    const [cx, cy] = px(f.points[0] as [number, number]);
    const radius = (f.radius ?? 4) * CELL;
    const count = Math.floor(radius * radius * 0.055);
    for (let i = 0; i < count; i += 1) {
      const angle = decoRand(`${cx}f`, i * 2) * Math.PI * 2;
      const rr = Math.sqrt(decoRand(`${cy}f`, i * 2 + 1)) * radius;
      const x = cx + Math.cos(angle) * rr;
      const y = cy + Math.sin(angle) * rr * 0.8;
      const s = 3 + decoRand("tree", i) * 4;
      ctx.fillStyle = i % 4 === 0 ? "#234a26" : "#1c3a1e";
      ctx.beginPath();
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x, y - s * 1.5);
      ctx.lineTo(x + s, y + s);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- 山脈 ----
  for (const f of geo) {
    if (f.kind !== "ridge") {
      continue;
    }
    const pxs = f.points.map(px);
    const widthPx = (f.width ?? 3) * CELL;
    for (let i = 0; i < pxs.length - 1; i += 1) {
      const [x0, y0] = pxs[i] as [number, number];
      const [x1, y1] = pxs[i + 1] as [number, number];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      const peaks = Math.max(3, Math.floor(segLen / 10));
      for (let k = 0; k < peaks; k += 1) {
        const t = k / peaks;
        const jx = (decoRand(`${x0}${i}`, k * 2) - 0.5) * widthPx * 1.6;
        const jy = (decoRand(`${y0}${i}`, k * 2 + 1) - 0.5) * widthPx;
        const x = x0 + (x1 - x0) * t + jx;
        const y = y0 + (y1 - y0) * t + jy;
        const s = 5 + decoRand("peak", i * 31 + k) * (widthPx * 0.45);
        ctx.fillStyle = "#4e4237";
        ctx.beginPath();
        ctx.moveTo(x - s, y + s * 0.8);
        ctx.lineTo(x, y - s);
        ctx.lineTo(x + s, y + s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#8a7c69";
        ctx.beginPath();
        ctx.moveTo(x - s * 0.32, y - s * 0.28);
        ctx.lineTo(x, y - s);
        ctx.lineTo(x + s * 0.32, y - s * 0.28);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ---- 水泊（梁山泊） ----
  for (const f of geo) {
    if (f.kind !== "marsh") {
      continue;
    }
    const [cx, cy] = px(f.points[0] as [number, number]);
    const radius = (f.radius ?? 4) * CELL;
    for (let i = 0; i < 14; i += 1) {
      const x = cx + (decoRand("marsh", i * 2) - 0.5) * radius * 2.2;
      const y = cy + (decoRand("marsh", i * 2 + 1) - 0.5) * radius * 1.6;
      ctx.fillStyle = i % 3 === 0 ? "rgba(58,106,120,0.9)" : "rgba(45,90,105,0.8)";
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + decoRand("marshr", i) * radius * 0.5, 4 + decoRand("marshr2", i) * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- 街道（河より下に敷く） ----
  const roadPaths = new Map<string, Array<[number, number]>>();
  const placeById = new Map(places.map((p) => [p.id, p]));
  ctx.strokeStyle = "rgba(160,136,96,0.75)";
  ctx.lineWidth = 2.4;
  ctx.setLineDash([7, 5]);
  for (const edge of edges) {
    const a = placeById.get(edge.from);
    const b = placeById.get(edge.to);
    if (a === undefined || b === undefined) {
      continue;
    }
    const ax = a.gridX * CELL;
    const ay = a.gridY * CELL;
    const bx = b.gridX * CELL;
    const by = b.gridY * CELL;
    // 中点をわずかに逸らして手描きの街道らしく
    const mx = (ax + bx) / 2 + (decoRand(edge.from + edge.to, 1) - 0.5) * 26;
    const my = (ay + by) / 2 + (decoRand(edge.from + edge.to, 2) - 0.5) * 26;
    const path: Array<[number, number]> = [
      [ax, ay],
      [(ax + mx) / 2, (ay + my) / 2],
      [mx, my],
      [(mx + bx) / 2, (my + by) / 2],
      [bx, by],
    ];
    roadPaths.set(edgeKey(edge.from, edge.to), path);
    roadPaths.set(edgeKey(edge.to, edge.from), [...path].reverse());
    ctx.beginPath();
    smoothPath(ctx, path);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ---- 河川・運河 ----
  for (const f of geo) {
    if (f.kind !== "river" && f.kind !== "canal") {
      continue;
    }
    const pxs = f.points.map(px);
    const widthPx = (f.width ?? 1.5) * CELL;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = f.kind === "canal" ? "#3d6a86" : "#2f5a7d";
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    smoothPath(ctx, pxs);
    ctx.stroke();
    // 水面のハイライト
    ctx.strokeStyle = "rgba(120,180,210,0.35)";
    ctx.lineWidth = Math.max(1.5, widthPx * 0.3);
    ctx.beginPath();
    smoothPath(ctx, pxs);
    ctx.stroke();
  }

  // ---- 海 ----
  ctx.beginPath();
  const c0 = px(coast[0] as [number, number]);
  ctx.moveTo(c0[0], c0[1]);
  for (const p of coast.slice(1)) {
    const [x, y] = px(p);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(w, 0);
  ctx.closePath();
  const seaGrad = ctx.createLinearGradient(w * 0.6, 0, w, h);
  seaGrad.addColorStop(0, "#1d3d5c");
  seaGrad.addColorStop(1, "#142c44");
  ctx.fillStyle = seaGrad;
  ctx.fill();
  // 海岸線
  ctx.strokeStyle = "rgba(150,190,210,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c0[0], c0[1]);
  for (const p of coast.slice(1)) {
    const [x, y] = px(p);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  // 波の点描
  for (let i = 0; i < 220; i += 1) {
    const x = w * 0.72 + decoRand("wave", i * 2) * w * 0.28;
    const y = decoRand("wave", i * 2 + 1) * h;
    ctx.strokeStyle = "rgba(150,190,220,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + decoRand("wavel", i) * 8, y);
    ctx.stroke();
  }

  return { canvas, roadPaths };
}

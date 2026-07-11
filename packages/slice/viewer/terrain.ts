// 責務: 世界タイル（シムの実データ）をオフスクリーンCanvasへ描画する。地形の傷（焼け跡・瓦礫・破門）は差分再描画で追従する
// 描画の出典はViewer独自のラスタライズではなく world.grid そのもの——シムと画面は同じ地形を見る
import { T } from "../src/grid";
import type { World } from "../src/model";
import { CELL, TILE_COLORS, decoRand } from "./theme";

export interface TerrainLayer {
  canvas: HTMLCanvasElement;
  repaint(idxs: number[]): void;
}

// タイルごとの色むら（同じ地形でも一枚岩に見せない）
function jitterColor(base: string, k: number): string {
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const m = 1 + (k - 0.5) * 0.14;
  const cl = (v: number): number => Math.max(0, Math.min(255, Math.round(v * m)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

export function buildTerrainLayer(world: World): TerrainLayer {
  const grid = world.grid;
  const w = grid.w * CELL;
  const h = grid.h * CELL;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("canvas 2d context unavailable");
  }

  const paintTile = (x: number, y: number, withDeco: boolean): void => {
    const t = grid.at(x, y);
    const base = TILE_COLORS[t] ?? TILE_COLORS[T.plain] as string;
    ctx.fillStyle = jitterColor(base, decoRand(`t${x},${y}`, 1));
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    if (!withDeco) {
      return;
    }
    const px = x * CELL;
    const py = y * CELL;
    const r = (n: number): number => decoRand(`d${x},${y}`, n);
    switch (t) {
      case T.forest: {
        // 木立: タイル内に1〜2本の針葉樹
        const trees = r(0) < 0.6 ? 2 : 1;
        for (let i = 0; i < trees; i += 1) {
          const cx = px + 2 + r(i * 2 + 1) * (CELL - 4);
          const cy = py + 3 + r(i * 2 + 2) * (CELL - 4);
          const s = 2 + r(i + 7) * 2;
          ctx.fillStyle = i % 2 === 0 ? "#1c3a1e" : "#234a26";
          ctx.beginPath();
          ctx.moveTo(cx - s, cy + s);
          ctx.lineTo(cx, cy - s * 1.4);
          ctx.lineTo(cx + s, cy + s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case T.mountain: {
        // 峰: 濃淡二色の三角
        const cx = px + CELL / 2 + (r(1) - 0.5) * 3;
        const cy = py + CELL / 2 + (r(2) - 0.5) * 2;
        const s = 3.4 + r(3) * 3;
        ctx.fillStyle = "#4e4237";
        ctx.beginPath();
        ctx.moveTo(cx - s, cy + s * 0.8);
        ctx.lineTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#8a7c69";
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.3, cy - s * 0.3);
        ctx.lineTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case T.sea: {
        if (r(1) < 0.06) {
          ctx.strokeStyle = "rgba(150,190,220,0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 1, py + CELL / 2);
          ctx.lineTo(px + CELL - 1, py + CELL / 2);
          ctx.stroke();
        }
        break;
      }
      case T.river: {
        // 水面のハイライト
        if (r(1) < 0.3) {
          ctx.fillStyle = "rgba(120,180,210,0.25)";
          ctx.fillRect(px + 1, py + 2, CELL - 2, 1.5);
        }
        break;
      }
      case T.marsh: {
        ctx.fillStyle = "rgba(90,140,130,0.5)";
        ctx.beginPath();
        ctx.ellipse(px + CELL / 2, py + CELL / 2, 2.5, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case T.ford: {
        // 渡し場: 桟の刻み
        ctx.strokeStyle = "rgba(210,190,150,0.7)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i += 1) {
          ctx.beginPath();
          ctx.moveTo(px + 1, py + i * (CELL / 3));
          ctx.lineTo(px + CELL - 1, py + i * (CELL / 3));
          ctx.stroke();
        }
        break;
      }
      case T.road: {
        // 轍の点描
        if (r(1) < 0.4) {
          ctx.fillStyle = "rgba(60,48,34,0.5)";
          ctx.fillRect(px + 2 + r(2) * 3, py + 2 + r(3) * 3, 1.4, 1.4);
        }
        break;
      }
      case T.wall: {
        ctx.strokeStyle = "#5f5f5f";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        break;
      }
      case T.gate: {
        ctx.fillStyle = "#6b4e2e";
        ctx.fillRect(px + 2, py + 1, CELL - 4, CELL - 2);
        break;
      }
      case T.rubble: {
        ctx.fillStyle = "#6d675f";
        for (let i = 0; i < 3; i += 1) {
          ctx.fillRect(px + 1 + r(i) * (CELL - 3), py + 1 + r(i + 4) * (CELL - 3), 2, 2);
        }
        break;
      }
      case T.burnt: {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(px + r(1) * 3, py + r(2) * 3, CELL - 3, CELL - 3);
        break;
      }
      default:
        break;
    }
  };

  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      paintTile(x, y, true);
    }
  }

  const repaint = (idxs: number[]): void => {
    for (const idx of idxs) {
      const { x, y } = grid.xyOf(idx);
      paintTile(x, y, true);
    }
  };

  return { canvas, repaint };
}

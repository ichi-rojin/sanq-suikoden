// 責務: 地理データの型（パックスキーマ設計書§2.2）。事実のみを持ち、規則を持たない
import type { EdgeId, NodeId } from "../shared/ids";
import type { Score100 } from "../shared/score100";

export type NodeType =
  | "府城"
  | "県城"
  | "村鎮"
  | "山寨適地"
  | "水泊"
  | "通過点"
  | "関所";

export type EdgeKind = "幹線" | "支線" | "水路";

export interface NodeDef {
  readonly id: NodeId;
  readonly nodeType: NodeType;
  readonly wealth: Score100;
  readonly population: Score100;
  readonly publicOrder: Score100;
  readonly sentiment: Score100;
  readonly enforcement: Score100;
  readonly defense: Score100;
  readonly encounterWeight: number;
  readonly regionTag: string;
}

export interface EdgeDef {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: EdgeKind;
  readonly distance: number;
}

export interface Geography {
  readonly nodes: readonly NodeDef[];
  readonly edges: readonly EdgeDef[];
}

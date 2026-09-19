export type LayoutTrackSize = number | string;
export type PanelDimension = number | string;

export interface RowNode {
  type: "row";
  id: string;
  children: LayoutNode[];
  gap?: number | undefined;
  sizes?: LayoutTrackSize[] | undefined;
}

export interface ColumnNode {
  type: "column";
  id: string;
  children: LayoutNode[];
  gap?: number | undefined;
  sizes?: LayoutTrackSize[] | undefined;
}

export interface StackNode {
  type: "stack";
  id: string;
  children: LayoutNode[];
  active?: string | undefined;
}

export interface PanelNode {
  type: "panel";
  id: string;
  child: LayoutNode;
  width?: PanelDimension | undefined;
  height?: PanelDimension | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

/** A physical Layout outlet interpreted by the host's Slot runtime. */
export interface SlotNode {
  type: "slot";
  id: string;
  slotId: string;
}

export type LayoutNode =
  | RowNode
  | ColumnNode
  | StackNode
  | PanelNode
  | SlotNode;

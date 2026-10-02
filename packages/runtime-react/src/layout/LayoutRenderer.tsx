import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { LayoutNode, LayoutTrackSize, PanelDimension, RowNode, SlotNode } from "./types.js";
import { isGridTrackOnlyDimension } from "./panelDimension.js";

import "./layout.css";

export interface LayoutRendererProps {
  root: LayoutNode;
  theme?: string | undefined;
  renderSlot?: ((slot: SlotNode) => ReactNode) | undefined;
  className?: string | undefined;
  drawerLabels?: {
    open: string;
    close: string;
    collapse: string;
    restore: string;
  } | undefined;
}

interface LayoutNodeViewProps {
  node: LayoutNode;
  renderSlot?: ((slot: SlotNode) => ReactNode) | undefined;
  drawerLabels?: LayoutRendererProps["drawerLabels"];
}

function toTrackSize(size: LayoutTrackSize): string {
  return typeof size === "number" ? `${size}fr` : size;
}

function toGridTemplate(
  sizes: LayoutTrackSize[] | undefined,
  childCount: number,
): string | undefined {
  if (sizes !== undefined) {
    return sizes.map(toTrackSize).join(" ");
  }

  return childCount > 0
    ? `repeat(${childCount}, minmax(0, 1fr))`
    : undefined;
}

function toPanelDimension(value: PanelDimension | undefined): PanelDimension | undefined {
  return value !== undefined && isGridTrackOnlyDimension(value) ? undefined : value;
}

function renderChildren(
  children: LayoutNode[],
  renderSlot: LayoutNodeViewProps["renderSlot"],
  drawerLabels: LayoutNodeViewProps["drawerLabels"],
): ReactNode {
  return children.map((child) => (
    <LayoutNodeView key={child.id} node={child} renderSlot={renderSlot} drawerLabels={drawerLabels} />
  ));
}

function ResponsiveRow({ node, renderSlot, drawerLabels }: LayoutNodeViewProps & { node: RowNode }) {
  if (drawerLabels === undefined) {
    throw new Error("Responsive Row requires project locale drawer labels.");
  }
  const policy = node.responsive!;
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const occupiedRef = useRef(0);
  const [narrow, setNarrow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const grid = gridRef.current;
    if (shell === null || grid === null) return;
    const measure = () => {
      const nodes = Array.from(grid.children) as HTMLElement[];
      const gap = node.gap ?? 0;
      const occupied = nodes.reduce((sum, child, index) => {
        if (index === policy.primaryIndex) return sum;
        if (index === policy.drawerIndex && (narrow || collapsed)) return sum;
        return sum + child.getBoundingClientRect().width;
      }, 0);
      if (!narrow && !collapsed) occupiedRef.current = occupied;
      const required = Math.max(occupied, occupiedRef.current) + policy.minPrimaryWidth + gap * (node.children.length - 1);
      setNarrow(shell.clientWidth < required);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [node, policy, narrow, collapsed]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (drawer === null) return;
    if (narrow && drawerOpen && !drawer.open) drawer.showModal();
    if ((!narrow || !drawerOpen) && drawer.open) drawer.close();
  }, [narrow, drawerOpen]);

  const drawerVisibleInGrid = !narrow && !collapsed;
  const sizes = node.sizes?.filter((_, index) => drawerVisibleInGrid || index !== policy.drawerIndex);
  const labels = drawerLabels;
  return (
    <div className="app-ui-layout-responsive-row" ref={shellRef} data-layout-responsive={narrow ? "drawer" : "grid"}>
      <div className="app-ui-layout-drawer-controls">
        <button type="button" onClick={() => narrow ? setDrawerOpen(true) : setCollapsed(!collapsed)}>
          {narrow ? labels.open : collapsed ? labels.restore : labels.collapse}
        </button>
      </div>
      <div
        className="app-ui-layout-node app-ui-layout-row"
        data-layout-node-id={node.id}
        data-layout-type={node.type}
        data-layout-drawer-state={narrow ? drawerOpen ? "open" : "closed" : collapsed ? "collapsed" : "inline"}
        ref={gridRef}
        style={{ gap: node.gap, gridTemplateColumns: toGridTemplate(sizes, node.children.length - (drawerVisibleInGrid ? 0 : 1)) }}
      >
        {node.children.map((child, index) => index === policy.drawerIndex ? (
          <dialog
            key={child.id}
            className="app-ui-layout-drawer"
            data-layout-drawer-mode={narrow ? "modal" : collapsed ? "collapsed" : "inline"}
            ref={drawerRef}
            onClose={() => setDrawerOpen(false)}
          >
            <button className="app-ui-layout-drawer-close" type="button" onClick={() => setDrawerOpen(false)} aria-label={labels.close}>{labels.close}</button>
            <LayoutNodeView node={child} renderSlot={renderSlot} drawerLabels={drawerLabels} />
          </dialog>
        ) : <LayoutNodeView key={child.id} node={child} renderSlot={renderSlot} drawerLabels={drawerLabels} />)}
      </div>
    </div>
  );
}

function LayoutNodeView({ node, renderSlot, drawerLabels }: LayoutNodeViewProps) {
  if (node.type === "row") {
    if (node.responsive !== undefined && node.children[node.responsive.primaryIndex] !== undefined && node.children[node.responsive.drawerIndex] !== undefined) {
      return <ResponsiveRow node={node} renderSlot={renderSlot} drawerLabels={drawerLabels} />;
    }
    const style: CSSProperties = {
      gap: node.gap,
      gridTemplateColumns: toGridTemplate(node.sizes, node.children.length),
    };

    return (
      <div
        className="app-ui-layout-node app-ui-layout-row"
        data-layout-node-id={node.id}
        data-layout-type={node.type}
        style={style}
      >
        {renderChildren(node.children, renderSlot, drawerLabels)}
      </div>
    );
  }

  if (node.type === "column") {
    const style: CSSProperties = {
      gap: node.gap,
      gridTemplateRows: toGridTemplate(node.sizes, node.children.length),
    };

    return (
      <div
        className="app-ui-layout-node app-ui-layout-column"
        data-layout-node-id={node.id}
        data-layout-type={node.type}
        style={style}
      >
        {renderChildren(node.children, renderSlot, drawerLabels)}
      </div>
    );
  }

  if (node.type === "stack") {
    const activeChild =
      node.children.find((child) => child.id === node.active) ?? node.children[0];

    return (
      <div
        className="app-ui-layout-node app-ui-layout-stack"
        data-active-node-id={activeChild?.id}
        data-layout-node-id={node.id}
        data-layout-type={node.type}
      >
        {activeChild === undefined ? null : (
          <LayoutNodeView node={activeChild} renderSlot={renderSlot} drawerLabels={drawerLabels} />
        )}
      </div>
    );
  }

  if (node.type === "panel") {
    const style: CSSProperties = {
      width: toPanelDimension(node.width),
      height: toPanelDimension(node.height),
      minWidth: node.minWidth,
      maxWidth: node.maxWidth,
      overflow: node.resizable === true ? "auto" : undefined,
      resize: node.resizable === true ? "horizontal" : undefined,
    };

    return (
      <div
        className="app-ui-layout-node app-ui-layout-panel"
        data-layout-node-id={node.id}
        data-layout-type={node.type}
        data-resizable={node.resizable === true}
        style={style}
      >
        <LayoutNodeView node={node.child} renderSlot={renderSlot} drawerLabels={drawerLabels} />
      </div>
    );
  }

  return (
    <div
      className="app-ui-layout-node app-ui-layout-slot"
      data-layout-node-id={node.id}
      data-layout-type={node.type}
      data-slot-id={node.slotId}
    >
      {renderSlot === undefined ? (
        <div className="app-ui-layout-slot-placeholder">
          <span>Slot</span>
          <strong>{node.slotId}</strong>
        </div>
      ) : (
        renderSlot(node)
      )}
    </div>
  );
}

export function LayoutRenderer({
  root,
  theme,
  renderSlot,
  className,
  drawerLabels,
}: LayoutRendererProps) {
  const rootClassName = ["app-ui-layout-root", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      data-theme={theme}
    >
      <LayoutNodeView node={root} renderSlot={renderSlot} drawerLabels={drawerLabels} />
    </div>
  );
}

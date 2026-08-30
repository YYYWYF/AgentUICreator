import type { CSSProperties, ReactNode } from "react";

import type {
  AppUIModel,
  LayoutNode,
  LayoutSize,
  SlotNode,
} from "../../framework/contracts/app-ui-model";

import "./layout.css";

export interface LayoutRendererProps {
  model: AppUIModel;
  renderSlot?: ((slot: SlotNode) => ReactNode) | undefined;
  className?: string | undefined;
}

interface LayoutNodeViewProps {
  node: LayoutNode;
  renderSlot?: ((slot: SlotNode) => ReactNode) | undefined;
}

function toTrackSize(size: LayoutSize): string {
  return typeof size === "number" ? `${size}fr` : size;
}

function toGridTemplate(
  sizes: LayoutSize[] | undefined,
  childCount: number,
): string | undefined {
  if (sizes !== undefined) {
    return sizes.map(toTrackSize).join(" ");
  }

  return childCount > 0
    ? `repeat(${childCount}, minmax(0, 1fr))`
    : undefined;
}

function renderChildren(
  children: LayoutNode[],
  renderSlot: LayoutNodeViewProps["renderSlot"],
): ReactNode {
  return children.map((child) => (
    <LayoutNodeView key={child.id} node={child} renderSlot={renderSlot} />
  ));
}

function LayoutNodeView({ node, renderSlot }: LayoutNodeViewProps) {
  if (node.type === "row") {
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
        {renderChildren(node.children, renderSlot)}
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
        {renderChildren(node.children, renderSlot)}
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
          <LayoutNodeView node={activeChild} renderSlot={renderSlot} />
        )}
      </div>
    );
  }

  if (node.type === "panel") {
    const style: CSSProperties = {
      width: node.width,
      height: node.height,
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
        <LayoutNodeView node={node.child} renderSlot={renderSlot} />
      </div>
    );
  }

  return (
    <div
      className="app-ui-layout-node app-ui-layout-slot"
      data-layout-node-id={node.id}
      data-layout-type={node.type}
      data-plugin-instance-ids={node.pluginInstanceIds.join(" ")}
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
  model,
  renderSlot,
  className,
}: LayoutRendererProps) {
  const rootClassName = ["app-ui-layout-root", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} data-app-ui-version={model.version} data-theme={model.settings?.theme}>
      <LayoutNodeView node={model.root} renderSlot={renderSlot} />
    </div>
  );
}

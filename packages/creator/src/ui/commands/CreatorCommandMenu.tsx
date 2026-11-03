import { Fragment } from "react";
import { creatorDisplayText } from "../product-presentation.js";
import type { CreatorCommandMenuItem } from "./creator-command-types.js";
export function CreatorCommandMenu({ items, active, title, notice, optionDomId, onPick, onSelect }: {
  items: CreatorCommandMenuItem[]; active: number; title: string; notice?: string | undefined;
  optionDomId: (index: number) => string;
  onPick: (id: string) => void; onSelect: (index: number) => void;
}) {
  return <div className="creator-command-menu">
    <strong>{title}</strong>
    {notice ? <p role="status">{notice}</p> : null}
    <div id="creator-command-menu" role="listbox" aria-label={title}>
      {items.map((item, index) => <Fragment key={item.id}>
      {item.category && item.category !== items[index - 1]?.category ? <div className="creator-command-category" role="presentation"><strong>{item.category}</strong></div> : null}
      <button id={optionDomId(index)} key={item.id} type="button" role="option" aria-selected={index === active} disabled={item.disabled} aria-disabled={item.disabled}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          onPick(item.id);
        }}
        onPointerEnter={() => onSelect(index)}
        onClick={event => {
          // Physical pointer activation is already handled by pointerdown.
          if (event.detail === 0) onPick(item.id);
        }}>
        <span className="creator-command-heading">
          <span>{item.current ? "✓ " : ""}{creatorDisplayText(item.label)}</span>
          {item.pluginId ? <code className="creator-command-plugin-id" title={item.detail ?? item.pluginId}>{item.pluginId}</code> : null}
        </span>
        {item.description || item.badge ? <span className="creator-command-secondary">
          {item.description ? <small>{creatorDisplayText(item.description)}</small> : null}
          {item.badge ? <small className="creator-command-badge" data-state={item.badgeState}>{creatorDisplayText(item.badge)}</small> : null}
        </span> : null}
      </button></Fragment>)}
    </div>
  </div>;
}

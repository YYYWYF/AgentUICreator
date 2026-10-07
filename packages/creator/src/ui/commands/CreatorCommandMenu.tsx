import type { CreatorCommandMenuItem } from "./creator-command-types.js";
export function CreatorCommandMenu({ items, active, title, notice, onPick, onSelect }: {
  items: CreatorCommandMenuItem[]; active: number; title: string; notice?: string | undefined;
  onPick: (id: string) => void; onSelect: (index: number) => void;
}) {
  return <div className="creator-command-menu">
    <strong>{title}</strong>
    {notice ? <p role="status">{notice}</p> : null}
    <div id="creator-command-menu" role="listbox" aria-label={title}>
      {items.map((item, index) => <button id={`creator-command-option-${index}`} key={item.id} type="button" role="option" aria-selected={index === active} disabled={item.disabled} aria-disabled={item.disabled}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => onSelect(index)} onClick={() => onPick(item.id)}>
        <span>{item.current ? "✓ " : ""}{item.label}</span>{item.description ? <small>{item.description}</small> : null}
      </button>)}
    </div>
  </div>;
}

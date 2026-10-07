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
      {items.map((item, index) => <button id={optionDomId(index)} key={item.id} type="button" role="option" aria-selected={index === active} disabled={item.disabled} aria-disabled={item.disabled}
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
        <span>{item.current ? "✓ " : ""}{item.label}</span>{item.description ? <small>{item.description}</small> : null}
      </button>)}
    </div>
  </div>;
}

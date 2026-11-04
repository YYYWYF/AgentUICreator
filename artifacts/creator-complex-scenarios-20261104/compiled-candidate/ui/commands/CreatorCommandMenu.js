import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment } from "react";
import { creatorDisplayText } from "../product-presentation.js";
export function CreatorCommandMenu({ items, active, title, notice, optionDomId, onPick, onSelect }) {
    return _jsxs("div", { className: "creator-command-menu", children: [_jsx("strong", { children: title }), notice ? _jsx("p", { role: "status", children: notice }) : null, _jsx("div", { id: "creator-command-menu", role: "listbox", "aria-label": title, children: items.map((item, index) => _jsxs(Fragment, { children: [item.category && item.category !== items[index - 1]?.category ? _jsx("div", { className: "creator-command-category", role: "presentation", children: _jsx("strong", { children: item.category }) }) : null, _jsxs("button", { id: optionDomId(index), type: "button", role: "option", "aria-selected": index === active, disabled: item.disabled, "aria-disabled": item.disabled, onPointerDown: event => {
                                if (event.button !== 0)
                                    return;
                                event.preventDefault();
                                event.stopPropagation();
                                onPick(item.id);
                            }, onPointerEnter: () => onSelect(index), onClick: event => {
                                // Physical pointer activation is already handled by pointerdown.
                                if (event.detail === 0)
                                    onPick(item.id);
                            }, children: [_jsxs("span", { className: "creator-command-heading", children: [_jsxs("span", { children: [item.current ? "✓ " : "", creatorDisplayText(item.label)] }), item.pluginId ? _jsx("code", { className: "creator-command-plugin-id", title: item.detail ?? item.pluginId, children: item.pluginId }) : null] }), item.description || item.badge ? _jsxs("span", { className: "creator-command-secondary", children: [item.description ? _jsx("small", { children: creatorDisplayText(item.description) }) : null, item.badge ? _jsx("small", { className: "creator-command-badge", "data-state": item.badgeState, children: creatorDisplayText(item.badge) }) : null] }) : null] }, item.id)] }, item.id)) })] });
}
//# sourceMappingURL=CreatorCommandMenu.js.map
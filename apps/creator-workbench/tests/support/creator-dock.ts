const dockId = "agent-ui-creator-dock";

if (!new URLSearchParams(location.search).has("creator-preview") && document.getElementById(dockId) === null) {
  const host = document.createElement("div");
  host.id = dockId;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; right: 1rem; top: 0; z-index: 2147483000; font-family: system-ui, sans-serif; }
    button { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.85rem; border: 1px solid #d9e1ee; border-top: 0; border-radius: 0 0 0.8rem 0.8rem; color: #344054; background: #fff; box-shadow: 0 0.35rem 1rem rgb(16 24 40 / 12%); font: inherit; font-size: 0.82rem; font-weight: 650; cursor: grab; touch-action: pan-y; user-select: none; }
    button::before { content: '✦'; color: #175cd3; font-size: 1rem; }
    button::after { content: ''; display: block; flex: 0 0 auto; width: 0.45rem; height: 0.45rem; box-sizing: border-box; border-right: 2px solid #667085; border-bottom: 2px solid #667085; transform: translateY(-0.1rem) rotate(45deg); }
    button[aria-expanded='true']::after { transform: translateY(0.1rem) rotate(225deg); }
    button[data-dragging] { cursor: grabbing; }
    button:hover { background: #f8faff; }
    button:focus-visible { outline: 3px solid #84caff; outline-offset: 3px; }
    iframe { position: absolute; right: 0; top: 3rem; width: min(27rem, calc(100vw - 1.5rem)); height: min(43rem, calc(100dvh - 4rem)); border: 1px solid #d0d5dd; border-radius: 0.9rem; background: #fff; box-shadow: 0 1rem 3rem rgb(16 24 40 / 22%); }
    iframe[hidden] { display: none; }
  `;

  const frame = document.createElement("iframe");
  frame.id = "agent-ui-creator-frame";
  frame.title = "Creator Agent";
  frame.allow = "clipboard-write";
  frame.hidden = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Creator Agent";
  toggle.setAttribute("aria-controls", frame.id);
  toggle.setAttribute("aria-expanded", "false");
  const positionKey = `${dockId}:left`;
  let left: number | null = null;
  let suppressClick = false;
  let drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null = null;

  const positionDock = (nextLeft: number) => {
    const toggleWidth = toggle.getBoundingClientRect().width;
    left = Math.max(0, Math.min(nextLeft, Math.max(0, window.innerWidth - toggleWidth)));
    host.style.left = `${left}px`;
    host.style.right = "auto";
    if (!frame.hidden) {
      // Keep the panel in the viewport even when the entry sits near either edge.
      const panelWidth = frame.getBoundingClientRect().width;
      const panelLeft = Math.max(8, Math.min(left + toggleWidth - panelWidth,
        window.innerWidth - panelWidth - 8));
      frame.style.left = `${panelLeft - left}px`;
      frame.style.right = "auto";
    }
  };

  toggle.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    drag = { pointerId: event.pointerId, startX: event.clientX,
      startLeft: host.getBoundingClientRect().left, moved: false };
    toggle.setPointerCapture(event.pointerId);
  });
  toggle.addEventListener("pointermove", (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < 5) return;
    drag.moved = true;
    suppressClick = true;
    toggle.setAttribute("data-dragging", "");
    positionDock(drag.startLeft + delta);
  });
  const finishDrag = (event: PointerEvent) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    toggle.removeAttribute("data-dragging");
    if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
    if (moved && left !== null) {
      try { localStorage.setItem(positionKey, String(left)); } catch { /* Storage may be unavailable. */ }
    }
  };
  toggle.addEventListener("pointerup", finishDrag);
  toggle.addEventListener("pointercancel", finishDrag);
  toggle.addEventListener("lostpointercapture", finishDrag);
  window.addEventListener("resize", () => positionDock(left ?? host.getBoundingClientRect().left));

  toggle.addEventListener("click", (event) => {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      return;
    }
    const opening = frame.hidden;
    if (opening && frame.getAttribute("src") === null) {
      frame.src = import.meta.env.VITE_CREATOR_DOCK_URL || "http://localhost:5174/dock.html";
    }
    frame.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "收起 Creator" : "Creator Agent";
    positionDock(left ?? host.getBoundingClientRect().left);
  });

  shadow.append(style, frame, toggle);
  document.body.append(host);
  try {
    const saved = localStorage.getItem(positionKey);
    if (saved !== null && Number.isFinite(Number(saved))) positionDock(Number(saved));
  } catch { /* Keep the default position when storage is unavailable. */ }
}

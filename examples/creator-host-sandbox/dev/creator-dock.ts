const dockId = "agent-ui-creator-dock";

if (document.getElementById(dockId) === null) {
  const host = document.createElement("div");
  host.id = dockId;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 2147483000; font-family: system-ui, sans-serif; }
    button { display: flex; align-items: center; gap: 0.45rem; padding: 0.75rem 1rem; border: 0; border-radius: 999px; color: #fff; background: #175cd3; box-shadow: 0 0.5rem 1.5rem rgb(16 24 40 / 22%); font: inherit; font-size: 0.875rem; font-weight: 700; cursor: pointer; }
    button:hover { background: #1849a9; }
    button:focus-visible { outline: 3px solid #84caff; outline-offset: 3px; }
    iframe { position: absolute; right: 0; bottom: 3.75rem; width: min(27rem, calc(100vw - 1.5rem)); height: min(43rem, calc(100vh - 5rem)); border: 1px solid #d0d5dd; border-radius: 0.9rem; background: #fff; box-shadow: 0 1rem 3rem rgb(16 24 40 / 22%); }
    iframe[hidden] { display: none; }
  `;

  const frame = document.createElement("iframe");
  frame.id = "agent-ui-creator-frame";
  frame.title = "Creator Agent";
  frame.allow = "clipboard-write";
  frame.hidden = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Creator";
  toggle.setAttribute("aria-controls", frame.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    const opening = frame.hidden;
    if (opening && frame.getAttribute("src") === null) {
      frame.src = import.meta.env.VITE_CREATOR_DOCK_URL || "http://localhost:5174/dock.html";
    }
    frame.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "收起 Creator" : "Creator";
  });

  shadow.append(style, frame, toggle);
  document.body.append(host);
}

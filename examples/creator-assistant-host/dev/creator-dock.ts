const dockId = "agent-ui-creator-dock";

if (document.getElementById(dockId) === null) {
  const host = document.createElement("div");
  host.id = dockId;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; right: 1rem; top: 0; z-index: 2147483000; font-family: system-ui, sans-serif; }
    button { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.85rem; border: 1px solid #d9e1ee; border-top: 0; border-radius: 0 0 0.8rem 0.8rem; color: #344054; background: #fff; box-shadow: 0 0.35rem 1rem rgb(16 24 40 / 12%); font: inherit; font-size: 0.82rem; font-weight: 650; cursor: pointer; }
    button::before { content: '✦'; color: #175cd3; font-size: 1rem; }
    button::after { content: ''; display: block; flex: 0 0 auto; width: 0.45rem; height: 0.45rem; box-sizing: border-box; border-right: 2px solid #667085; border-bottom: 2px solid #667085; transform: translateY(-0.1rem) rotate(45deg); }
    button[aria-expanded='true']::after { transform: translateY(0.1rem) rotate(225deg); }
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
  toggle.addEventListener("click", () => {
    const opening = frame.hidden;
    if (opening && frame.getAttribute("src") === null) {
      frame.src = import.meta.env.VITE_CREATOR_DOCK_URL || "http://localhost:5174/dock.html";
    }
    frame.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.textContent = opening ? "收起 Creator" : "Creator Agent";
  });

  shadow.append(style, frame, toggle);
  document.body.append(host);
}

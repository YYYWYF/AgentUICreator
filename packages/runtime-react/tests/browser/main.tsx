import { createRoot } from "react-dom/client";
import { LayoutRenderer, type RowNode } from "../../src/index.js";

import "./style.css";

const row: RowNode = {
  type: "row", id: "platform", gap: 0,
  responsive: { type: "trailing-drawer", primaryIndex: 1, drawerIndex: 2, minPrimaryWidth: 320 },
  sizes: ["280px", "minmax(0, 1fr)", "260px"],
  children: [
    { type: "slot", id: "navigation", slotId: "navigation" },
    { type: "slot", id: "conversation", slotId: "conversation" },
    { type: "slot", id: "business", slotId: "business" },
  ],
};

const labels = { open: "打开业务面板", close: "关闭业务面板", collapse: "收起业务面板", restore: "恢复业务面板" };

createRoot(document.getElementById("root")!).render(
  <div data-testid="agent-container">
    <LayoutRenderer root={row} drawerLabels={labels} renderSlot={(slot) => {
      if (slot.slotId === "navigation") return <nav data-testid="navigation">导航</nav>;
      if (slot.slotId === "conversation") return <section data-testid="chat"><div data-testid="messages">聊天消息</div><form data-testid="composer"><input aria-label="消息" /><button type="button">发送</button></form></section>;
      return <aside data-testid="business"><div>业务面板</div><div style={{ height: 900 }}>滚动内容</div></aside>;
    }} />
  </div>,
);

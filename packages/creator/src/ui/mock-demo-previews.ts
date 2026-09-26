/** Static resource illustrations shown beside missing-plugin installation actions. */
function preview(content: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260"><rect width="480" height="260" rx="18" fill="#f8fafc"/><rect x="16" y="16" width="448" height="228" rx="12" fill="white" stroke="#e2e8f0"/><g font-family="Arial,sans-serif" font-size="16" fill="#344054">${content}</g></svg>`)}`;
}
const text = (x: number, y: number, value: string, fill = "#344054") => `<text x="${x}" y="${y}" fill="${fill}">${value}</text>`;
const line = (x: number, y: number, width: number, fill = "#e2e8f0") => `<rect x="${x}" y="${y}" width="${width}" height="10" rx="5" fill="${fill}"/>`;
const chart = preview(text(38, 51, "Quarterly Sales") + [120, 180, 160, 240].map((value, n) => text(38, 91 + n * 40, `Q${n + 1}`) + line(84, 79 + n * 40, 290) + line(84, 79 + n * 40, value / 240 * 290, "#3b82f6") + text(390, 91 + n * 40, String(value))).join(""));
const progress = preview(text(38, 51, "Verify the current change on CI") + text(38, 91, "✓ clone     ✓ install     ● build     ○ test") + line(38, 125, 400) + line(38, 125, 270, "#3b82f6") + text(38, 172, "Building · about 2 min remaining") + text(38, 213, "Cancel", "#667085"));
const plan = preview(text(38, 50, "Execution plan") + ["✓ Inspect current implementation", "✓ Compare AG-UI runtime", "● Update UI composition", "○ Run regression checks"].map((step, n) => text(38, 90 + n * 39, step, n === 2 ? "#175cd3" : "#667085")).join(""));
const status = preview(`<circle cx="54" cy="105" r="7" fill="#3b82f6"/>` + text(76, 111, "Analyzing workspace") + text(381, 111, "0:12", "#667085") + line(38, 145, 390) + text(38, 202, "Working → Waiting → Done", "#667085"));
const group = preview(text(38, 50, "Task group · 3 agents") + ["✓ Researcher", "✓ Reviewer", "✓ Writer"].map((s, n) => `<rect x="34" y="${67 + n * 52}" width="412" height="43" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>` + text(50, 94 + n * 52, s)).join(""));

const reasoning = preview(text(38, 54, "Reasoning") + line(38, 82, 350) + line(38, 110, 280) + text(38, 166, "Assistant answer") + line(38, 188, 330));
const tools = preview(text(38, 52, "Tool calls") + ["✓ Search files", "✓ Read document", "✓ Compare results"].map((label, n) => text(38, 98 + n * 48, label)).join(""));
const approval = preview(text(38, 54, "Tool execution / Approval") + text(38, 98, "Allow this operation?") + text(38, 155, "Allow", "#027a48") + text(168, 155, "Deny", "#b42318"));

export const mockResourcePreviews: Readonly<Record<string, string>> = {
  "assistant-ui-reasoning": reasoning,
  "assistant-ui-tool-group": tools,
  "assistant-ui-tool-fallback": approval,
  "chart-message": chart,
  "job-progress-message": progress,
  "agent-plan-message": plan,
  "agent-status-message": status,
  "task-group": group,
};

import { defineScenario, type MockScenarioStep } from "../scenario.js";

// Standard v0.9 operations, matching the pinned assistant-ui A2UI documentation.
// Every snapshot is self-contained because replace:true rebuilds its message state.
export function a2uiOrderSnapshot(status: "review" | "confirmed" | "cancelled" = "review"): MockScenarioStep {
  const interactive = status === "review";
  return {
    type: "activity-snapshot", messageId: "a2ui-order-message",
    activityType: "a2ui-surface", replace: true,
    content: { a2ui_operations: [
      { version: "v0.9", createSurface: { surfaceId: "order" } },
      { version: "v0.9", updateComponents: { surfaceId: "order", components: [
        { id: "root", component: "Card", title: interactive ? "Order Review" : `Order ${status}`, children: interactive ? ["summary", "actions"] : ["summary"] },
        { id: "summary", component: "Text", text: { path: "/summary" } },
        ...(interactive ? [
          { id: "actions", component: "Row", children: ["confirm", "cancel"] },
          { id: "confirm", component: "Button", label: "Confirm", action: { name: "confirm_order" } },
          { id: "cancel", component: "Button", label: "Cancel", action: { name: "cancel_order" } },
        ] : []),
      ] } },
      { version: "v0.9", updateDataModel: { surfaceId: "order", path: "/", contents: {
        summary: interactive ? "Product: Developer Plan\n\nSeats: 5\n\nTotal: $50/month" : `Order ${status}${status === "confirmed" ? " ✓" : ""}`,
      } } },
    ] },
  };
}

export const a2uiInteractiveOrderScenario = defineScenario({
  id: "a2ui-interactive-order", title: "A2UI · Interactive Order Card",
  description: "A declarative Basic Catalog surface with native A2UI action continuation.",
  category: "presentation", capabilities: ["a2ui"],
  resources: [{ id: "a2ui", label: "A2UI Official Integration", sourceItemId: "integration/a2ui" }],
  reference: {
    audience: "frontend", protocol: "AG-UI 0.0.59 + A2UI v0.9",
    pattern: "ACTIVITY_SNAPSHOT → native conversion → present renderer → user action → forwardedProps.a2uiAction → continuation Run",
    presentation: "Interactive A2UI Surface", level: "advanced",
    eventFlow: ["RUN_STARTED", "ACTIVITY_SNAPSHOT", "RUN_FINISHED"],
    notes: ["No Frontend Tool permission or Plugin required.", "Live and in-memory revisit only; persisted cold A2UI history requires a separate backend contract."],
  },
  steps: [a2uiOrderSnapshot()],
  a2uiActions: {
    branches: {
      confirm_order: [a2uiOrderSnapshot("confirmed"), { type: "message", text: "Order confirmed." }],
      cancel_order: [a2uiOrderSnapshot("cancelled"), { type: "message", text: "Order cancelled." }],
    },
    fallback: [{ type: "message", text: "Unknown order action." }],
  },
});

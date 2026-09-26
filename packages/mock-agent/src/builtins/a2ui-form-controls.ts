import { defineScenario, type MockScenarioStep } from "../scenario.js";

/** Only components supported by the pinned official A2UI Basic Catalog. */
export function a2uiFormControlsSnapshot(): MockScenarioStep {
  return {
    type: "activity-snapshot", messageId: "a2ui-form-controls-message",
    activityType: "a2ui-surface", replace: true,
    content: { a2ui_operations: [
      { version: "v0.9", createSurface: { surfaceId: "trip" } },
      { version: "v0.9", updateComponents: { surfaceId: "trip", components: [
        { id: "root", component: "Card", title: "Trip Preferences", children: ["icon", "name", "type", "destination", "departure", "extras", "recent", "save"] },
        { id: "icon", component: "Icon", name: "calendar" },
        { id: "name", component: "TextField", label: "Name", name: "name", placeholder: "Alice" },
        { id: "type", component: "ChoicePicker", label: "Trip type", name: "tripType", variant: "mutuallyExclusive", value: "business", options: [{ label: "Business", value: "business" }, { label: "Personal", value: "personal" }] },
        { id: "destination", component: "ChoicePicker", label: "Destination", name: "destination", variant: "mutuallyExclusive", displayStyle: "chips", options: [{ label: "Tokyo", value: "tokyo" }, { label: "Seoul", value: "seoul" }] },
        { id: "departure", component: "DateTimeInput", label: "Departure", name: "departure", value: "2026-10-10" },
        { id: "extras", component: "CheckBox", label: "Airport transfer", name: "transfer", value: true },
        { id: "recent", component: "List", children: ["tokyo", "seoul", "singapore"] },
        { id: "tokyo", component: "Text", text: "Tokyo" },
        { id: "seoul", component: "Text", text: "Seoul" },
        { id: "singapore", component: "Text", text: "Singapore" },
        { id: "save", component: "Button", label: "Save", action: { name: "save_trip" } },
      ] } },
    ] },
  };
}

export const a2uiFormControlsScenario = defineScenario({
  id: "a2ui-form-controls", title: "A2UI · Form Controls",
  description: "Official Basic Catalog controls, using native surface conversion and action continuation.",
  category: "presentation", capabilities: ["a2ui"],
  resources: [{ id: "a2ui", label: "A2UI Official Integration", sourceItemId: "integration/a2ui" }],
  reference: {
    audience: "frontend", protocol: "AG-UI 0.0.59 + A2UI v0.9",
    pattern: "ACTIVITY_SNAPSHOT → official converter → styled Generative UI → native A2UI action",
    presentation: "A2UI Form Controls", level: "advanced",
    eventFlow: ["RUN_STARTED", "ACTIVITY_SNAPSHOT", "RUN_FINISHED"],
    notes: [
      "Pluginless and tool-less; Save demonstrates native action continuation, not form-value submission.",
      "0.0.21 has no Slider, CheckboxGroup, multipleSelection mapping or $field resolver. TextField uses a placeholder, not a default value.",
      "Cold history Activity persistence is outside the current application history contract.",
    ],
  },
  steps: [a2uiFormControlsSnapshot()],
  a2uiActions: { branches: { save_trip: [{ type: "message", text: "Trip preference action received." }] } },
});

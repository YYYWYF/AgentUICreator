# assistant-ui Generative UI


`@assistant-ui/react-generative-ui` is the canonical component vocabulary and
renderer. Prefer official vocabulary before creating custom components. Inspect
the project's installed version: do not infer capabilities from unreleased
source or from the presence of related CSS selectors.

- Install optional `integration/generative-ui` for the shared factory, official
  styled vocabulary and Action Registry. It requires the Registry-managed
  `agent-component/assistant-ui-generative-ui`; neither is a default Foundation.
- A2UI is a protocol transport into the official Generative UI vocabulary:
  `ACTIVITY_SNAPSHOT → official A2UI converter → official renderer`.
  A2UI does not own the component library or styles. Do not implement its parser,
  reducer or Basic Catalog mappings in Plugin or application code.
- `createAgentUIGenerativeUI` exposes `present()` and `promptUser()` capabilities.
  Capability availability does not grant Agent permission. Do not automatically
  mount or advertise `present` / `prompt_user`. A2UI uses only a backend render
  projection; explicit Tool authorization requires a separate product decision.
- The fixed 0.0.21 release lacks Slider, CheckboxGroup, `$field` and
  Input.defaultValue. ChoicePicker does not implement multipleSelection.
  Use supported controls and official Form `$input` collection; never fabricate
  these missing APIs or describe Table/Chart as A2UI Basic Catalog components.
- Keep optional source provenance and official styles under Source Registry;
  regenerate from the pinned local assistant-ui source. CSS permits only
  mechanical `.agent-ui-conversation` selector scoping, with no visual redesign.
- assistant-ui supports restored A2UI activity history, but the current LangGraph
  checkpoint adapter does not define Activity persistence. Do not claim cold
  history support or add a frontend cache.

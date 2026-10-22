import type { DemoFormController, DemoFormService, DemoFormSnapshot } from "../../services/demo-form";
export function createDemoFormService(): DemoFormService {
  let controller: DemoFormController | undefined;
  let snapshot: DemoFormSnapshot = { values: { firstName: "", lastName: "", email: "", projectIdea: "" }, submitCount: 0 };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const current = () => { if (!controller) throw new Error("Form capability unavailable"); return controller; };
  return {
    attach(next) { controller = next; return () => { if (controller === next) controller = undefined; }; },
    publish(values) { snapshot = { ...snapshot, values: { ...values } }; notify(); },
    recordSubmission(values) { snapshot = { values: { ...values }, submitCount: snapshot.submitCount + 1 }; notify(); },
    async setField(name, value) { current().setField(name, value); return { success: true }; },
    async reset() { current().reset(); return { success: true }; },
    async submit() { return current().submit(); },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

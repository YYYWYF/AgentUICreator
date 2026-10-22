import type { DemoDialogService, DemoDialogSnapshot } from "../../services/demo-dialog";
export function createDemoDialogService(): DemoDialogService {
  let snapshot: DemoDialogSnapshot = { open: false, title: "", message: "" };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    open(input) { snapshot = { ...input, open: true }; notify(); },
    close() { if (!snapshot.open) return; snapshot = { ...snapshot, open: false }; notify(); },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

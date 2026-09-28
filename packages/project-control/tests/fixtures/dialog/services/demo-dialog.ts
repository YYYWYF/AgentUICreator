export const DEMO_DIALOG_SERVICE = "demo.dialog" as const;
export interface DemoDialogInput { title: string; message: string }
export interface DemoDialogSnapshot { open: boolean; title: string; message: string }
export interface DemoDialogService {
  open(input: DemoDialogInput): void;
  close(): void;
  getSnapshot(): DemoDialogSnapshot;
  subscribe(listener: () => void): () => void;
}
declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap { [DEMO_DIALOG_SERVICE]: DemoDialogService }
}

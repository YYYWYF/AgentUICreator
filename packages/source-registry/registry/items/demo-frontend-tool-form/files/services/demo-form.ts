import type { ReactHookFormCapability } from "../integrations/react-hook-form";

export const DEMO_FORM_SERVICE = "demo.form" as const;
export const DEMO_FORM_FIELDS = ["firstName", "lastName", "email", "projectIdea"] as const;
export type DemoFormField = typeof DEMO_FORM_FIELDS[number];
export type DemoFormValues = Record<DemoFormField, string>;
export interface DemoFormSnapshot { values: DemoFormValues; submitCount: number }
export type DemoFormSubmitResult = { success: true; values: DemoFormValues } | { success: false; message: string };
export interface DemoFormController {
  setField(name: DemoFormField, value: string): void;
  reset(): void;
  submit(): Promise<DemoFormSubmitResult>;
}
export interface DemoFormService extends ReactHookFormCapability<DemoFormField> {
  attach(controller: DemoFormController): () => void;
  publish(values: DemoFormValues): void;
  recordSubmission(values: DemoFormValues): void;
  getSnapshot(): DemoFormSnapshot;
  subscribe(listener: () => void): () => void;
}
declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap { [DEMO_FORM_SERVICE]: DemoFormService }
}

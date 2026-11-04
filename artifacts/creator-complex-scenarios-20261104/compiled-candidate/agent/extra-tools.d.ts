import type { ToolContext } from "./tools.js";
type Add = (name: string, description: string, schema: any, invoke: (input: any) => any) => void;
export declare function addExtraTools(context: ToolContext, add: Add): void;
export {};
//# sourceMappingURL=extra-tools.d.ts.map
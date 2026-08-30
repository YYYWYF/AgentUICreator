import { chatPlugin } from "./chat";
import { filePreviewPlugin } from "./file-preview";

export const pluginDefinitions = [chatPlugin, filePreviewPlugin] as const;

export { chatPlugin, filePreviewPlugin };

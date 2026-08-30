import { chatPlugin } from "./chat/definition";
import { filePreviewPlugin } from "./file-preview/definition";

export const pluginDefinitions = [chatPlugin, filePreviewPlugin] as const;

export { chatPlugin, filePreviewPlugin };
export { ChatPlugin } from "./chat";
export { FilePreviewPlugin } from "./file-preview";

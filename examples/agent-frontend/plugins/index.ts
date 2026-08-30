import { chatPlugin } from "./chat/definition";
import { filePreviewPlugin } from "./file-preview/definition";
import { antdXTemplatePlugins } from "./antd-x-template-library";

export const pluginDefinitions = [
  ...antdXTemplatePlugins,
  chatPlugin,
  filePreviewPlugin,
] as const;

export { chatPlugin, filePreviewPlugin };
export { ChatPlugin } from "./chat";
export { FilePreviewPlugin } from "./file-preview";
export * from "./antd-x-template-library";

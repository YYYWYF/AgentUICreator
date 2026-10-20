import { RetrievalChunksPlugin as Implementation } from "@za38.03/agent-ui-plugins/retrieval-chunks";
import type { ComponentProps } from "react";

export function RetrievalChunksPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}

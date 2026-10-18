import { CanonicalRetrievalChunks, type RetrievalChunksPluginProps } from "@za38.03/agent-ui-plugins";
/** Compatibility entry; shared Runtime and presentation have one owner. */
export function RetrievalChunksToolUI(props: RetrievalChunksPluginProps) {
  return <CanonicalRetrievalChunks {...props} />;
}

import { CanonicalWebSearch, type WebSearchPluginProps } from "@za38.03/agent-ui-plugins";
/** Compatibility entry; shared Runtime and presentation have one owner. */
export function WebSearchToolUI(props: WebSearchPluginProps) {
  return <CanonicalWebSearch {...props} />;
}

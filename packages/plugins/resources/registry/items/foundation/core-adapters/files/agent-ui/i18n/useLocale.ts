import { useMemo } from "react";
import { useLocaleCode } from "@za38.03/agent-ui-plugins";
import { resolveLocaleNamespace } from "./locale-registry";
import type { AgentUILocaleMessages } from "./locale-types";
/** Project message extensions follow the unified presentation locale. */
export function useLocale<K extends keyof AgentUILocaleMessages>(namespace: K): AgentUILocaleMessages[K] {
  const locale = useLocaleCode();
  return useMemo(() => resolveLocaleNamespace(locale, namespace), [locale, namespace]);
}

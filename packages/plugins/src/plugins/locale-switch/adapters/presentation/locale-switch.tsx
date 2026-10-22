import { useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { NativeSelect, NativeSelectOption, useAgentUILocale, useAgentUILocaleCode, type AgentUILocaleCode } from "../../../../public.js";
// The application supplies its existing locale service; no private context is created.
interface AgentUILocaleService {
  getSnapshot(): { locale: AgentUILocaleCode };
  subscribe(listener: () => void): () => void;
  setLocale(locale: AgentUILocaleCode): void;
}

export interface LocaleSwitchPluginProps {
  service?: AgentUILocaleService | undefined;
  contextId?: string;
  rootProps?: ComponentProps<"section">;
  selectProps?: ComponentProps<typeof NativeSelect>;
  children?: ReactNode;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
}

const subscribeNone = () => () => {};
export function CanonicalLocaleSwitchPlugin({ service, contextId = "locale", rootProps, selectProps, children }: LocaleSwitchPluginProps) {
  const messages = useAgentUILocale("accessibility");
  const currentLocale = useAgentUILocaleCode();
  const locale = useSyncExternalStore(service?.subscribe ?? subscribeNone,
    service ? () => service.getSnapshot().locale : () => currentLocale,
    service ? () => service.getSnapshot().locale : () => currentLocale);
  if (!service) return null;
  return <section {...rootProps}
    className={["locale-switch-plugin", rootProps?.className].filter(Boolean).join(" ")}
    aria-label={rootProps?.["aria-label"] ?? messages.language} data-ui-plugin="locale-switch">
    <NativeSelect id={`${contextId}-control`} aria-label={messages.language}
      className="locale-switch-plugin-control" value={locale} {...selectProps}
      onChange={event => {
        selectProps?.onChange?.(event);
        if (event.defaultPrevented) return;
        const nextLocale = event.currentTarget.value;
        if (nextLocale === "zh-CN" || nextLocale === "en-US") service.setLocale(nextLocale as AgentUILocaleCode);
      }}>
      {children ?? <><NativeSelectOption value="zh-CN">{messages.chineseName}</NativeSelectOption>
        <NativeSelectOption value="en-US">{messages.englishName}</NativeSelectOption></>}
    </NativeSelect>
  </section>;
}

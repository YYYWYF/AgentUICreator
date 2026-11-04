import {
  useAgentUILocaleCode,
  usePluginInstance,
  type UIPluginComponentProps,
} from "@za38.03/agent-ui-plugins";
import {
  QuickHelpCardInstanceIdContext,
  toggleQuickHelpCardExpanded,
  useQuickHelpCardExpanded,
} from "../../hooks/useQuickHelpCardExpanded";
import { getQuickHelpCardTitle } from "./config";
import "./styles.css";

export function QuickHelpCardPlugin({ renderSlot }: UIPluginComponentProps) {
  const localeCode = useAgentUILocaleCode();
  const instance = usePluginInstance();
  // One card identity may be composed several times: the instance id keeps the
  // copy and the expansion state separate per card.
  const cardId = instance.id;
  const expanded = useQuickHelpCardExpanded(cardId);
  const title = getQuickHelpCardTitle(cardId, localeCode);

  return (
    <QuickHelpCardInstanceIdContext.Provider value={cardId}>
      <section
        className="quick-help-card"
        data-expanded={expanded ? "true" : "false"}
      >
        <header className="quick-help-card__header">
          <button
            type="button"
            className="quick-help-card__toggle"
            aria-expanded={expanded}
            onClick={() => toggleQuickHelpCardExpanded(cardId)}
          >
            <span className="quick-help-card__title">{title}</span>
            <span className="quick-help-card__chevron" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
          </button>
          {renderSlot("headerActions", null, { layout: "inline" })}
        </header>
        <div className="quick-help-card__body" hidden={!expanded}>
          {renderSlot("body")}
        </div>
      </section>
    </QuickHelpCardInstanceIdContext.Provider>
  );
}

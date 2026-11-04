import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import "./styles.css";

type QuickHelpCardProps = {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
};

const messages: Record<string, { title: string; expand: string; collapse: string }> = {
  "zh-CN": { title: "使用帮助", expand: "展开", collapse: "折叠" },
  "en-US": { title: "Usage Help", expand: "Expand", collapse: "Collapse" },
};

export function QuickHelpCardPlugin(props: QuickHelpCardProps) {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();

  const headerActions = props.renderSlot ? props.renderSlot("headerActions", null) : null;
  const body = props.renderSlot ? props.renderSlot("body", null) : null;

  return (
    <section className="quick-help-card" aria-label={text.title}>
      <div className="quick-help-card__header">
        <button
          type="button"
          className="quick-help-card__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="quick-help-card__title">{text.title}</span>
          <span className="quick-help-card__indicator" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="quick-help-card__toggle-label">
            {expanded ? text.collapse : text.expand}
          </span>
        </button>
        {headerActions ? (
          <div className="quick-help-card__header-actions">{headerActions}</div>
        ) : null}
      </div>
      <div className="quick-help-card__body" id={bodyId} hidden={!expanded}>
        {body}
      </div>
    </section>
  );
}

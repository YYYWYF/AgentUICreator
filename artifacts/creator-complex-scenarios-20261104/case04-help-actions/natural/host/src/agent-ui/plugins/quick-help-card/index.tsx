import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useId } from "react";
import { fillComposerDraft } from "../../hooks/useComposerDraftFill";
import {
  toggleQuickHelpCardExpanded,
  useQuickHelpCardExpanded,
} from "../../hooks/useQuickHelpCardExpanded";
import type { ReactNode } from "react";
import "./styles.css";

type QuickHelpCardProps = {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
};

const messages: Record<
  string,
  { title: string; expand: string; collapse: string; actions: string }
> = {
  "zh-CN": {
    title: "使用帮助",
    expand: "展开",
    collapse: "折叠",
    actions: "快捷操作",
  },
  "en-US": {
    title: "Usage Help",
    expand: "Expand",
    collapse: "Collapse",
    actions: "Quick actions",
  },
};

type QuickHelpCardAction = {
  id: string;
  /** Button copy keyed by the unified Agent UI locale code. */
  label: Record<string, string>;
  /** Text written into the conversation draft. Clicking never sends it. */
  draft: string;
};

/**
 * Bottom action row. Append entries here to add more prompt buttons; every
 * entry only fills the composer draft, sending stays a user action.
 */
const quickHelpActions: QuickHelpCardAction[] = [
  {
    id: "view-example",
    label: { "zh-CN": "查看示例", "en-US": "View example" },
    draft: "请给我一个使用示例",
  },
];

export function QuickHelpCardPlugin(props: QuickHelpCardProps) {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;
  // Shared with header actions such as the "知道了" action, so both plugins
  // control the same expansion state and it survives theme switching.
  const expanded = useQuickHelpCardExpanded();
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
          onClick={toggleQuickHelpCardExpanded}
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
      <div className="quick-help-card__actions" role="group" aria-label={text.actions}>
        {quickHelpActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="quick-help-card__action"
            onClick={() => {
              fillComposerDraft(action.draft);
            }}
          >
            {action.label[localeCode] ?? action.label["zh-CN"]}
          </button>
        ))}
      </div>
    </section>
  );
}

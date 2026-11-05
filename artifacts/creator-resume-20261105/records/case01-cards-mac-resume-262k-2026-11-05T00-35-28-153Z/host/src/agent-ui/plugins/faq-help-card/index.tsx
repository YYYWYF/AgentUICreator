import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useId } from "react";
import {
  HelpCardExpansionProvider,
  useHelpCardExpansion,
} from "../../hooks/useHelpCardExpansion";
import type { ReactNode } from "react";
// Both help cards share the same visual primitive.
import "../quick-help-card/styles.css";
import "./styles.css";

type FaqHelpCardProps = {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
};

type FaqMessage = {
  title: string;
  expand: string;
  collapse: string;
  items: { question: string; answer: string }[];
};

const messages: Record<string, FaqMessage> = {
  "zh-CN": {
    title: "常见问题",
    expand: "展开",
    collapse: "折叠",
    items: [
      { question: "怎么开始提问？", answer: "在底部输入框描述你的问题，回车或点击发送即可。" },
      { question: "可以上传文件吗？", answer: "可以，点击输入框左侧的回形针按钮添加附件。" },
      { question: "历史会话在哪里？", answer: "左侧「历史会话」列表可以查找并切换之前的对话。" },
    ],
  },
  "en-US": {
    title: "FAQ",
    expand: "Expand",
    collapse: "Collapse",
    items: [
      {
        question: "How do I ask a question?",
        answer: "Describe it in the composer at the bottom, then press Enter or the send button.",
      },
      {
        question: "Can I upload files?",
        answer: "Yes, use the attachment button on the left of the composer.",
      },
      {
        question: "Where is my conversation history?",
        answer: "Use the History list on the left to find and switch earlier conversations.",
      },
    ],
  },
};

export function FaqHelpCardPlugin(props: FaqHelpCardProps) {
  return (
    <HelpCardExpansionProvider>
      <FaqHelpCardView {...props} />
    </HelpCardExpansionProvider>
  );
}

function FaqHelpCardView(props: FaqHelpCardProps) {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;
  // Scoped to this card instance, so the other help card keeps its own state.
  const { expanded, toggle } = useHelpCardExpansion();
  const bodyId = useId();

  const headerActions = props.renderSlot ? props.renderSlot("headerActions", null) : null;

  return (
    <section className="quick-help-card" aria-label={text.title}>
      <div className="quick-help-card__header">
        <button
          type="button"
          className="quick-help-card__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={toggle}
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
        <dl className="faq-help-card__list">
          {text.items.map((item) => (
            <div key={item.question} className="faq-help-card__item">
              <dt className="faq-help-card__question">{item.question}</dt>
              <dd className="faq-help-card__answer">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

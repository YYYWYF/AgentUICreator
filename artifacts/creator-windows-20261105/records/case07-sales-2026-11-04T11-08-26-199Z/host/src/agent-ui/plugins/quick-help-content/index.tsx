import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import "./styles.css";

const messages: Record<string, string> = {
  "zh-CN": "你可以提问、上传附件或查看历史记录",
  "en-US": "You can ask questions, upload attachments, or view history",
};

export function QuickHelpContentPlugin() {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;

  return (
    <p className="quick-help-content" role="note">
      {text}
    </p>
  );
}

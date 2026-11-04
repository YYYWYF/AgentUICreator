import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import "./styles.css";

const messages: Record<string, string> = {
  "zh-CN": "测试提示：请勿输入敏感信息",
  "en-US": "Test notice: Do not enter sensitive information",
};

export function TestNoticePlugin() {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"]!;

  return (
    <div className="test-notice" role="status">
      <p className="test-notice__text">{text}</p>
    </div>
  );
}

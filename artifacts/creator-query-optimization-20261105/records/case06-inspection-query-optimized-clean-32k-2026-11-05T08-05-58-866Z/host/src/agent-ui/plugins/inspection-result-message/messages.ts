import type { AgentUILocaleCode } from "@za38.03/agent-ui-plugins";

export type InspectionCopy = {
  title: string;
  cardLabel: (target: string | null) => string;
  summary: (counts: { passed: number; failed: number; other: number }) => string;
  failedHeading: string;
  passedHeading: string;
  otherHeading: string;
  emptyChecks: string;
  invalid: string;
  expandLabel: (name: string) => string;
  collapseLabel: (name: string) => string;
  copyAction: string;
  copyLabel: (name: string) => string;
  copied: string;
  copyFailed: string;
  codeLabel: string;
  messageLabel: string;
  durationLabel: string;
  noDetail: string;
  durationValue: (milliseconds: number) => string;
  statusValue: (status: string) => string;
};

const zhCN: InspectionCopy = {
  title: "检查结果",
  cardLabel: (target) => (target ? `检查结果：${target}` : "检查结果"),
  summary: ({ passed, failed, other }) => {
    const parts = [`通过 ${passed} 项`, `失败 ${failed} 项`];
    if (other > 0) parts.push(`其他 ${other} 项`);
    return parts.join(" · ");
  },
  failedHeading: "未通过",
  passedHeading: "已通过",
  otherHeading: "其他状态",
  emptyChecks: "本次检查没有返回检查项。",
  invalid: "检查结果数据格式不正确。",
  expandLabel: (name) => `展开 ${name} 的失败原因`,
  collapseLabel: (name) => `收起 ${name} 的失败原因`,
  copyAction: "复制错误详情",
  copyLabel: (name) => `复制 ${name} 的错误详情`,
  copied: "已复制",
  copyFailed: "复制失败，请手动选中文本",
  codeLabel: "错误码",
  messageLabel: "说明",
  durationLabel: "耗时",
  noDetail: "没有更多错误详情。",
  durationValue: (milliseconds) => `${milliseconds} 毫秒`,
  statusValue: (status) => (status ? `状态：${status}` : "状态未知"),
};

const enUS: InspectionCopy = {
  title: "Inspection result",
  cardLabel: (target) => (target ? `Inspection result: ${target}` : "Inspection result"),
  summary: ({ passed, failed, other }) => {
    const parts = [`${passed} passed`, `${failed} failed`];
    if (other > 0) parts.push(`${other} other`);
    return parts.join(" · ");
  },
  failedHeading: "Failed",
  passedHeading: "Passed",
  otherHeading: "Other statuses",
  emptyChecks: "This inspection returned no checks.",
  invalid: "The inspection result data is not valid.",
  expandLabel: (name) => `Show failure reason for ${name}`,
  collapseLabel: (name) => `Hide failure reason for ${name}`,
  copyAction: "Copy error details",
  copyLabel: (name) => `Copy error details for ${name}`,
  copied: "Copied",
  copyFailed: "Copy failed. Select the text manually.",
  codeLabel: "Code",
  messageLabel: "Message",
  durationLabel: "Duration",
  noDetail: "No further error details.",
  durationValue: (milliseconds) => `${milliseconds} ms`,
  statusValue: (status) => (status ? `Status: ${status}` : "Status unknown"),
};

const copyByLocale: Partial<Record<AgentUILocaleCode, InspectionCopy>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getInspectionCopy(locale: AgentUILocaleCode): InspectionCopy {
  return copyByLocale[locale] ?? zhCN;
}

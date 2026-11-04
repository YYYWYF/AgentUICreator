import type { AgentUILocaleCode } from "@za38.03/agent-ui-plugins";

/** Copy shown by the inspection result card. */
export type InspectionResultLabels = {
  heading: string;
  targetLabel: string;
  passedHeading: string;
  failedHeading: string;
  otherHeading: string;
  passedLabel: string;
  failedLabel: string;
  expandReason: string;
  collapseReason: string;
  copyDetail: string;
  copied: string;
  copyFailed: string;
  code: string;
  message: string;
  duration: string;
  milliseconds: string;
  invalidData: string;
};

const enUS: InspectionResultLabels = {
  heading: "Inspection result",
  targetLabel: "Target",
  passedHeading: "Passed",
  failedHeading: "Failed",
  otherHeading: "Other statuses",
  passedLabel: "Passed",
  failedLabel: "Failed",
  expandReason: "Expand reason",
  collapseReason: "Collapse reason",
  copyDetail: "Copy error details",
  copied: "Copied",
  copyFailed: "Copy failed",
  code: "Code",
  message: "Message",
  duration: "Duration",
  milliseconds: "ms",
  invalidData: "The inspection result payload could not be read, so it was not rendered.",
};

const zhCN: InspectionResultLabels = {
  heading: "检查结果",
  targetLabel: "目标",
  passedHeading: "通过",
  failedHeading: "失败",
  otherHeading: "其他状态",
  passedLabel: "通过",
  failedLabel: "失败",
  expandReason: "展开原因",
  collapseReason: "收起原因",
  copyDetail: "复制错误详情",
  copied: "已复制",
  copyFailed: "复制失败",
  code: "错误码",
  message: "错误信息",
  duration: "耗时",
  milliseconds: "毫秒",
  invalidData: "检查结果数据格式无法识别，已跳过渲染。",
};

/** Complete dictionaries keyed by the central Agent UI locale codes. */
export const inspectionResultLocale: Record<AgentUILocaleCode, InspectionResultLabels> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export const inspectionResultFallback: InspectionResultLabels = enUS;

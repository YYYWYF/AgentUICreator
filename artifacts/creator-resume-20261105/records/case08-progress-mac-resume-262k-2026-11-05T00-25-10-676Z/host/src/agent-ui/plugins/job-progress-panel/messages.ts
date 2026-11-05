export type JobProgressPanelMessages = {
  panelTitle: string;
  empty: string;
  runningCount: string;
  status: Record<string, string>;
  completedHint: string;
  showErrorDetail: string;
  hideErrorDetail: string;
  errorCodeLabel: string;
  errorMessageLabel: string;
  errorMessageFallback: string;
  jobIdLabel: string;
};

const zhCN: JobProgressPanelMessages = {
  panelTitle: "任务进度",
  empty: "暂无任务进度",
  runningCount: "{count} 个任务进行中",
  status: {
    pending: "等待中",
    queued: "排队中",
    running: "进行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  },
  completedHint: "任务已完成",
  showErrorDetail: "展开错误原因",
  hideErrorDetail: "收起错误原因",
  errorCodeLabel: "错误码",
  errorMessageLabel: "错误信息",
  errorMessageFallback: "未提供错误信息",
  jobIdLabel: "任务 ID",
};

const enUS: JobProgressPanelMessages = {
  panelTitle: "Job progress",
  empty: "No job progress yet",
  runningCount: "{count} jobs running",
  status: {
    pending: "Pending",
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  completedHint: "Job completed",
  showErrorDetail: "Show error details",
  hideErrorDetail: "Hide error details",
  errorCodeLabel: "Error code",
  errorMessageLabel: "Message",
  errorMessageFallback: "No error message provided",
  jobIdLabel: "Job ID",
};

export const jobProgressPanelMessages: Record<string, JobProgressPanelMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type JobProgressMessages = {
  panelLabel: string;
  title: string;
  empty: string;
  runningSummary: string;
  statusRunning: string;
  statusCompleted: string;
  statusFailed: string;
  errorToggle: string;
  errorCodeLabel: string;
  errorMissing: string;
};

const jobProgressMessages = {
  "zh-CN": {
    panelLabel: "任务进度",
    title: "任务进度",
    empty: "暂无任务进度。",
    runningSummary: "进行中",
    statusRunning: "进行中",
    statusCompleted: "已完成",
    statusFailed: "失败",
    errorToggle: "错误原因",
    errorCodeLabel: "错误码",
    errorMissing: "未提供错误原因。",
  } satisfies JobProgressMessages,
  "en-US": {
    panelLabel: "Job progress",
    title: "Job progress",
    empty: "No job progress yet.",
    runningSummary: "Running",
    statusRunning: "Running",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    errorToggle: "Error reason",
    errorCodeLabel: "Error code",
    errorMissing: "No error reason provided.",
  } satisfies JobProgressMessages,
};

export function getJobProgressMessages(localeCode: string | null | undefined): JobProgressMessages {
  return localeCode === "en-US" ? jobProgressMessages["en-US"] : jobProgressMessages["zh-CN"];
}

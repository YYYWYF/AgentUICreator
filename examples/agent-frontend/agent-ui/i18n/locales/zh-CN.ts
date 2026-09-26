import type { AgentUILocaleMessages } from "../locale-types";

export const zhCN = {
  frontendTools: {
    formTitle: "个人资料表单",
    firstName: "名",
    lastName: "姓",
    email: "邮箱",
    projectIdea: "项目想法",
    resetForm: "重置",
    submitForm: "提交",
    formRequired: "此字段必填",
    formInvalid: "表单包含无效字段",
    formBusy: "表单正在提交",
    formUnavailable: "表单能力不可用",
    formSubmitted: "已提交表单",
    formReset: "已重置表单",
    formUpdating: "正在更新表单…",
    formFailed: "无法更新表单",
    fieldUpdated: "已更新",
    fieldTo: "为",

    close: "关闭",
    opening: "正在打开弹窗…",
    opened: "已打开弹窗",
    failed: "无法打开弹窗",
  },
  threadList: {
    newThread: "新建会话",
    newChat: "新会话",
    search: "搜索会话",
    moreOptions: "更多选项",
    running: "运行中",
    rename: "重命名",
    archive: "归档",
    delete: "删除",
  },
  theme: {
    settings: "主题设置",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
  },
} satisfies AgentUILocaleMessages;

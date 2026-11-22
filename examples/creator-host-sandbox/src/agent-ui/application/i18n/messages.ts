import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = {
  projectWorkspace: {
    title: '项目空间',
    description: '集中查看项目进展与协作资料。',
    placeholder: '内容占位',
    backToChat: '返回当前会话',
    overview: '项目总览',
    overviewDescription: '这里将展示项目列表、最近进展和待办事项。',
    resources: '协作与资料',
    resourcesDescription: '这里将展示项目成员、共享文档和常用资源。',
    configuration: '当前 Stack 配置',
    configurationDescription: '直接读取本项目的 app-ui.json。chat 与 projects 按 children 的顺序对应；切换只改变运行时选中状态。',
    source: '展开完整 JSON',
  },
};

const enUS: typeof zhCN = {
  projectWorkspace: {
    title: 'Project workspace',
    description: 'Review project progress and shared resources in one place.',
    placeholder: 'Placeholder content',
    backToChat: 'Back to current chat',
    overview: 'Project overview',
    overviewDescription: 'Project lists, recent progress and tasks will appear here.',
    resources: 'People and resources',
    resourcesDescription: 'Project members, shared documents and useful resources will appear here.',
    configuration: 'Current Stack configuration',
    configurationDescription: 'Read directly from this project’s app-ui.json. chat and projects match children in order; switching only updates runtime selection.',
    source: 'Expand full JSON',
  },
};

const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };

export function getProjectMessages(locale: AgentUILocaleCode) {
  return messages[locale];
}

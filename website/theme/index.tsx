import { Navigate, useLocation } from '@rspress/core/runtime';
import {
  HomeLayout as DefaultHomeLayout,
  NotFoundLayout as DefaultNotFoundLayout,
} from '@rspress/core/theme-original';
import type { ComponentProps } from 'react';

export * from '@rspress/core/theme-original';

const templates = [
  {
    id: 'workbench',
    title: '工作台',
    description: '完整的对话工作区，让提问、任务和历史会话集中在一处。',
    alt: '工作台模板：完整对话区、输入框和右侧会话列表',
  },
  {
    id: 'assistant',
    title: '助手',
    description: '从页面角落展开，随时提问，继续手边的工作。',
    alt: '助手模板：在业务页面上展开的悬浮聊天窗口',
  },
  {
    id: 'embedded',
    title: '嵌入式',
    description: '融入页面中的固定区域，与文档、表单或业务内容并排。',
    alt: '嵌入式模板：文档编辑区与右侧助理并排展示',
  },
];

export function HomeLayout(props: ComponentProps<typeof DefaultHomeLayout>) {
  return (
    <DefaultHomeLayout
      {...props}
      beforeFeatures={
        <>
          {props.beforeFeatures}
          <section className="home-templates" aria-labelledby="home-templates-title">
            <div className="home-templates__heading">
              <h2 id="home-templates-title">选择一种形态，打造你的 AI 助理</h2>
              <p>从工作台、悬浮助手或嵌入式模板开始，用 Creator 调整布局、样式和功能。</p>
            </div>
            <div className="home-templates__grid">
              {templates.map(template => (
                <figure className="home-templates__card" key={template.id}>
                  <img src={`/images/agent-ui/layout-${template.id}-hd.png`} alt={template.alt} width={2824} height={1672} />
                  <figcaption>
                    <h3>{template.title}</h3>
                    <p>{template.description}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        </>
      }
    />
  );
}

// Keep links opened before the documentation navigation changes usable.
const previousRoutes: Record<string, string> = {
  '/plugins/messages': '/plugins/index.html#消息与回复',
  '/plugins/input-features': '/plugins/index.html#附件语音与快捷输入',
  '/plugins/stop-retry-edit': '/plugins/index.html#停止重试与编辑',
  '/plugins/reasoning-and-tools': '/plugins/index.html#思考工具与任务进度',
  '/plugins/approval-and-questions': '/plugins/index.html#提问与审批',
  '/plugins/results-and-actions': '/plugins/index.html#来源文件与图表',
  '/plugins/history': '/plugins/index.html#会话与历史记录',
  '/plugins/appearance-and-account': '/plugins/index.html#主题语言与账号',
  '/agent-ui': '/plugins/index.html',
  '/agent-ui/index': '/plugins/index.html',
  '/agent-ui/messages': '/plugins/index.html#消息与回复',
  '/agent-ui/input-features': '/plugins/index.html#附件语音与快捷输入',
  '/agent-ui/stop-retry-edit': '/plugins/index.html#停止重试与编辑',
  '/agent-ui/reasoning-and-tools': '/plugins/index.html#思考工具与任务进度',
  '/agent-ui/approval-and-questions': '/plugins/index.html#提问与审批',
  '/agent-ui/results-and-actions': '/plugins/index.html#来源文件与图表',
  '/agent-ui/history': '/plugins/index.html#会话与历史记录',
  '/agent-ui/appearance-and-account': '/plugins/index.html#主题语言与账号',
  '/guide/mock': '/mock/index.html',
  '/guide/mock/index': '/mock/index.html',
  '/guide/mock/builtin-scenarios': '/mock/builtin-scenarios.html',
  '/guide/mock/local-recordings': '/mock/local-recordings.html',
  '/guide/verify-results': '/guide/examples/verify-results.html#检查清单',
  '/guide/adjustments/command-source': '/guide/adjustments/mention-and-commands.html#助理快捷命令',
  '/guide/adjustments/default-theme': '/development/styling-and-localization.html#默认主题',
  '/integration/frontend-tools': '/development/frontend-tools.html',
  '/integration/react-host-control': '/development/react-host-control.html',
  '/integration/attachments-dictation-feedback': '/development/attachments-dictation-feedback.html',
  '/integration/vue': '/development/vue.html',
  '/integration/web-component': '/development/web-component.html',
  '/integration/web-component-api': '/development/web-component-api.html',
  '/integration/react-host-api': '/development/react-host-api.html',
  '/integration/index': '/development/index.html',
  '/integration': '/development/index.html',
  '/integration/connect-agent': '/development/connect-agent.html',
  '/integration/react': '/development/react.html',
  '/integration/history-backend': '/development/history-backend.html',
  '/integration/agent-options': '/development/agent-options.html',
  '/customization/state-and-events': '/guide/adjustments/state-and-events.html',
  '/customization/localization': '/guide/adjustments/localization.html',
  '/customization/generative-ui': '/guide/adjustments/generative-ui.html',
  '/customization/custom-renderers': '/guide/adjustments/custom-renderers.html',
  '/customization/source-takeover': '/development/source-takeover.html',
  '/customization/default-theme': '/development/styling-and-localization.html#默认主题',
  '/customization/index': '/guide/adjustments/index.html',
  '/customization': '/guide/adjustments/index.html',
  '/customization/test-customizations': '/guide/examples/verify-results.html#检查清单',
  '/customization/command-source': '/guide/adjustments/mention-and-commands.html#助理快捷命令',
  '/customization/themes': '/guide/adjustments/themes.html',
  '/customization/mention-and-commands': '/guide/adjustments/mention-and-commands.html',
  '/composition/index': '/development/layout-and-composition.html',
  '/composition': '/development/layout-and-composition.html',
  '/composition/development': '/guide/add-function.html',
  '/composition/create-plugin': '/development/create-plugin.html',
  '/guide/request-changes': '/guide/index.html',
  '/agent-ui/plugin-composition': '/development/layout-and-composition.html',
  '/customization/plugin-composition': '/development/layout-and-composition.html',
  '/customization/layout-and-composition': '/development/layout-and-composition.html',
  '/plugins/app-ui-model': '/development/layout-and-composition.html',
  '/start/overview': '/plugins/index.html',
  '/start/messages': '/plugins/index.html#消息与回复',
  '/start/input-features': '/plugins/index.html#附件语音与快捷输入',
  '/start/stop-retry-edit': '/plugins/index.html#停止重试与编辑',
  '/start/reasoning-and-tools': '/plugins/index.html#思考工具与任务进度',
  '/start/approval-and-questions': '/plugins/index.html#提问与审批',
  '/start/results-and-actions': '/plugins/index.html#来源文件与图表',
  '/start/history': '/plugins/index.html#会话与历史记录',
  '/start/appearance-and-account': '/plugins/index.html#主题语言与账号',
  '/start/install-creator': '/start/index.html#1-安装并启动-creator',
  '/start/project-modes': '/start/index.html#2-创建-agent-ui',
  '/start/first-agent-ui': '/start/index.html#3-挂载助理组件',
  '/start/ai-assisted': '/start/index.html#5-定制-agent-界面',
  '/start/generated-files': '/development/project-structure.html',
  '/start/read-documentation': '/development/index.html',
};

export function NotFoundLayout() {
  const location = useLocation();
  const key = location.pathname.replace(/\.html$/u, '').replace(/\/$/u, '');
  const destination = Object.hasOwn(previousRoutes, key) ? previousRoutes[key] : undefined;
  if (!destination) return <DefaultNotFoundLayout />;

  const [pathname, section] = destination.split('#');
  // Merged feature articles retain their original subsection anchors.
  const hash = pathname === '/plugins/index.html' && location.hash
    ? location.hash
    : section ? `#${section}` : location.hash;
  return <Navigate replace to={{ pathname, search: location.search, hash }} />;
}

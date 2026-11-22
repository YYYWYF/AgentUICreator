import { HomeLayout as DefaultHomeLayout } from '@rspress/core/theme-original';
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

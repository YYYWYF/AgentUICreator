# 本地生成 Host 修改

这些文件位于 examples/creator-host-sandbox/src/agent-ui，被 Git 忽略；记录补丁用于审查，不宣称全目录已迁移到最新版。

- application/AgentSurface.tsx：现有开发态状态事件增加 threadId，与 tracked 模板相同。
- agent-ui/conversation/config/conversation-runtime-config.ts：开发态连接 /__agent-ui/mock-data，生产默认仍不指定数据端点。
- plugins/ask-user-question-demo/definition.ts：human toolkit 入口声明 interaction.type=interrupt。
- agent-ui/conversation/human-tool-uis/ask-user-question.tsx：调用 resumeInterrupt，不再依赖 addResult。
- integrations/a2ui/create-a2ui-toolkit.tsx：与 tracked A2UI 集成模板同步，只让当前可交互卡操作生效。
- plugins/frontend-tool-form-demo/index.tsx、styles.css：与 tracked Demo 模板同步，服务保持挂载、当前轮相关显示。
- app-ui/app-ui.json：仅表单所在列从 320px 改为 0px；保留其他 Plugin 与配置。

host-generated-fixes.patch 使用源注册表 c7fa22f3 或已记录的旧实现重建基线，只用于审查这些差异。AgentMount.tsx 自身是 tracked 文件，直接看 Git diff。

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const summary = JSON.parse(await readFile(path.join(root, 'summary.json'), 'utf8'));
const number = value => value == null ? '—' : value.toLocaleString('en-US');
const rows = summary.records.map(r => `| ${r.profile} ${r.attempt} | ${r.nativeStatus} | ${number(r.seconds)} | ${number(r.toolCalls)} | ${r.usage.missingResponses ? '≥' : ''}${number(r.usage.input)} / ${r.usage.missingResponses ? '≥' : ''}${number(r.usage.output)} | ${number(r.firstSuccessfulMutation?.startSeconds)} | ${r.qualification ?? ''} |`).join('\n');
const selected = ['clean', 'recovery'].map(profile => summary.records.findLast(r => r.profile === profile && r.nativeStatus === 'success' && !r.qualification && r.packageSnapshot?.unchanged));
const comparison = selected.filter(Boolean).flatMap(r => [
  `| ${r.profile} 旧基线 | ${number(r.baseline.seconds)} | ${number(r.baseline.tools)} | ${number(r.baseline.usage.input)} | ${number(r.baseline.usage.output)} | ${number(r.baseline.firstSuccessfulMutation?.startSeconds)} |`,
  `| ${r.profile} 本轮 ${r.attempt} | ${number(r.seconds)} | ${number(r.toolCalls)} | ${r.usage.missingResponses ? '≥' : ''}${number(r.usage.input)} | ${r.usage.missingResponses ? '≥' : ''}${number(r.usage.output)} | ${number(r.firstSuccessfulMutation?.startSeconds)} |`,
]).join('\n');
const browser = summary.browserRecords.map(r => `| ${r.record} | ${r.status} | ${(r.checks ?? []).filter(c => c.status === 'passed').length}/${(r.checks ?? []).length} | ${r.sourceUnchanged} |`).join('\n');
await writeFile(path.join(root, 'README.md'), `# Creator 查询与实施优化：原始任务对照

本次实现按“静态分析和注册反馈 → 上下文投影和文档/API 导航”的顺序完成，保留通用编码 Agent。未添加固定步骤、累计调用上限或催促写代码的提示词。仅在隔离项目中测试，未改维护示例或原始 vendor。

## 实现

1. Data Message UI 的名称支持可静态解析的 const 和导入别名；动态调用、let、循环引用仍拒绝。新改但未被选中的插件诊断进入本次改动校验，原有和无关错误保持差量边界。
2. 校验返回 pluginStates 和 registryFresh，分别表达源码发现、AppUIModel 选择和运行目录状态。available 只表示发现/声明分析可用，不代表 CSS、类型、构建或交互全部通过。尚未选中对应 excluded_not_selected，不应继续寻找注册脚本。
3. 项目/插件默认返回导航摘要，保留完整身份、布局和 prop 名称；继承的 DOM 类型详情可通过 detail: full 查询。Host 的完整观察、定位、授权和新鲜度判断继续使用原结果。归档样本的项目摘要由 115,410 字符缩至 76,328 字符（33.9%）；这不是 token 降幅。
4. 无效文档 topic 返回真实 topic 及重试参数；缺失导出返回同一实际安装包 root/contracts/ui 中验证过的模块位置，并明确未搜索范围。完整编辑上下文仍可查询。

更新了 packages/creator/skills/ui-plugin-development/SKILL.md 和 references/authoring-contracts.md：注册与选择区别、按需 API 详情、Host 默认关闭 Playwright 时不再要求修复验证设施。该开关是用户先前要求，静态检查与 Runtime 校验保留。

另修复测试中实际遇到的分类请求兼容问题：网关以 400/422 和明确“不支持此特性”拒绝 JSON Schema 时，复用已有的一次 JSON-object 回退与本地严格校验。不按供应商名称分支，也不放宽编辑权限。clean 3 在此兼容修复前完成；其正常 JSON Schema 路径未改变。

## 对照条件与口径

- 原始任务：questions.json 中 case06-inspection，接收 CUSTOM app.inspection.result，展示检查结果、展开失败详情、复制错误；未改写任务来引导模型。
- deepseek-v4.1-flash；Agent 输出 32,768；上下文 262,144；保留 12,000；摘要输出 8,192；单请求超时 120 秒；temperature 0.2。没有累计模型/图步数上限。
- clean 使用原来 128 个文件的初始项目；recovery 使用原来 134 个文件、含损坏 application.json 的恢复项目。每轮 comparison-input-proof.json 比较原始提示与全部 Agent UI 初始源码哈希；环境启动失败的轮次明确记为未核对。
- input/output 是供应商累计报告，包括重复输入与缓存输入；output 已包含 reasoning，不再相加。缺 usage 的轮次只提供下界。seconds 是原生任务耗时，不含后续独立浏览器回放。首次修改含删除损坏文件。
- 旧基线尚未关闭原生 Playwright 工具，新测按用户要求关闭；选取的两份旧基线也没有调用该工具。历史构建没有完整冻结清单，因此这是同任务观察对照，不能当作严格单变量因果证明或稳定成功率。
- 后续轮次采用 package-snapshot.json 记录的固定构建产物，运行后复核哈希并清理；仅复制发布资产，第三方依赖仍链接当前工作区，不能作为干净安装证明。

## 最终有效对照

| 场景 | 秒 | 工具 | 输入 token | 输出 token | 首次修改秒 |
| --- | ---: | ---: | ---: | ---: | ---: |
${comparison}

两轮原生任务均成功，模型当轮基础 4 项和后续独立 7 项均通过。clean 本轮较旧基线更早实施，但输入/输出略增；recovery 的调用与已报告 token 较旧基线减少，缺失的一条 400 分类响应 usage 不按零补齐。单次随机任务结果不建立稳定成功率或成本保证。

## 每轮记录

| 场景/轮次 | 原生结果 | 秒 | 工具 | input / output token | 首次修改秒 | 资格说明 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
${rows}

历史 clean 基线：410.171 秒、29 次工具、1,549,612 / 19,863 token、248.745 秒首次修改。
历史 recovery 基线：811.982 秒、66 次工具、4,353,573 / 38,248 token、79.517 秒首次修改，612.107 秒才组成插件。

包含失败与受干扰样本的全部实验累计：记录到 ${number(summary.aggregate.recordedSeconds)} 秒、${number(summary.aggregate.toolCalls)} 次工具、已报告输入 ≥${number(summary.aggregate.input)} / 输出 ≥${number(summary.aggregate.output)} token，缺失 ${number(summary.aggregate.missingUsageResponses)} 条响应 usage。这个耗时合计不包含环境启动、独立浏览器和人工分析等待。

所有失败尝试均保留，不把服务错误、观察流断开或 QA 选择器错误改写为成功。某轮原生 RUN_ERROR 后，已保存代码的独立浏览器通过也不改变该轮原生失败。

## 独立浏览器证据

| 记录 | 结果 | 检查通过 | 模型源码未改变 |
| --- | --- | --- | --- |
${browser}

基础 4 项：正常 CUSTOM 事件展示、失败详情展开、真实剪贴板复制、空/畸形 checks 不崩溃。
扩展 3 项：检查项/错误中的 HTML 按纯文本显示、切换中英文保持已展开详情、嵌套畸形字段不崩溃。独立回放会重新复制当时的构建产物；summary.json 的 packageDifferencesFromModel 逐文件记录与模型当轮的差异，不默认认为两个快照相同。恢复场景回放期间的差异涉及 Plugins 的 Markdown/cache/catalog 资产；基础 4 项也在模型当轮自己的冻结构建中通过。扩展的展开状态使用详情正文断言，避免重复错误码造成误判；原始误判记录保留。

## 工程验证与限制

- Creator 最终全量：54 文件、565 测试通过；Creator Node/浏览器和 Operator 类型检查、Creator 构建、离线文档打包通过。
- Operator 相关校验通过现有资源视图包装器执行：6 文件、42 测试通过。check-index.json 和 checks/ 保留初始失败与修正后通过日志；初次全量/裸跑的环境或夹具错误不隐去。
- 测试环境出现模型连接重置、网关特性拒绝、QA SSE 观察器断开，以及其他工作区构建触发依赖 HMR；对应轮次单独标注。观察器退出后的编译取消不能当作最初故障原因。
- 两个最早的简短 live 控制台文件曾被下一轮覆盖；原生事件、HTTP 元数据、结果和生成源码仍保留。后续控制台改为每轮独立、拒绝覆盖。
- Windows 路径相关既有用例通过；未执行真实 Windows 或新机器/npm 安装验收。自动 Playwright 仍关闭；独立 QA 回放是此归档的额外证据。
- 动手偏晚及多余查询仍需按成功轮次评估；不能仅凭一轮更快就宣称工具或 token 更省，也没有证明所有复杂任务均可稳定完成。

## 核查与复跑

运行 node artifacts/creator-query-optimization-20261105/verify.mjs 核查清单与 SHA-256；它不调用模型，不代表浏览器/平台验收。
复跑前先按仓库正常流程构建包、运行旧 QA setup.mjs，配置本地 Creator 凭据，再运行 run-comparison.mjs clean 或 recovery。模型调用会消耗套餐，证据目录不含凭据。collect.mjs 收集原始输出，report.mjs 更新本报告，然后再次 collect.mjs 更新清单。
`);
console.log(JSON.stringify({report: 'README.md', attempts: summary.records.length}));

# Creator 常用问题逐题审阅记录

问题清单见 questions.json；各次运行的实际结果、耗时和证据边界以对应 summary.json 为准。测试只在独立临时项目执行，未改维护示例。

- single-review-*：问题 1 的界面恢复与审阅记录。保留最初的 QA 失败现场，不能把目录存在等同于通过。
- ui-question02-*：问题 2“我想让历史会话用我自己的接口”的真实界面测试。
- ui-question03-*：问题 3“我想把历史会话移到右侧”的真实界面测试。
- ui-question04-*：问题 4 原始请求的失败记录。
- analysis-question04/：对原始请求和用户追加澄清两轮记录的只读排查。
- [目标名称误拦截修复与重测](../creator-removal-routing-20261105/README.md)：同模型、32K 输出重测及真实 Chrome 流式行为验证。

问题 5 尚未开始。历史 record-manifest.json 只描述其各自采集时点；delivery-manifest.json 是本次交付的完整文件哈希清单。模型凭据和临时运行环境不入库，审阅服务地址只在本机服务运行期间有效。

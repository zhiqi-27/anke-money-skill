# Anke Money Skill

[English](README.md) · 中文

让支持 Agent Skills、HTTPS 请求和安全凭据配置的 AI 助手，在用户授权后读取和更新 Anke Money 数据。默认直接调用 HTTP API，Remote MCP 可选。

Anke Money 是一款个人与家庭财务记录工具，用于记录收支、预算、资产、负债、
应收款和净资产。Skill 是可选的 Anke Money Pro 能力，不是自动执行操作的理财顾问，
也不会连接银行。

## 安装

```bash
npx skills add zhiqi-27/anke-money-skill --skill anke-money-agent -g
```

安装完成后，重新打开或刷新所使用的 AI 助手，使其发现 `anke-money-agent`。

## 配置 API Key

1. 在 Anke Money 中登录并进入 `Anke Money Skill` 页面。
2. 创建或复制 API Key。
3. 在 AI 助手的密钥设置或运行环境中，将 Key 配置为 `ANKE_MONEY_API_KEY`。
4. 让助手使用 `anke-money-agent`，例如“查看我本月的收支”。默认无需添加 MCP。

环境变量必须对实际执行 HTTP 请求的助手进程可见。在另一个终端执行 `export`
不会自动影响已经启动的桌面助手或云端助手。缺少 Key 时，Skill 会引导你配置，
不会要求你把 Key 粘贴到聊天中。安装 Skill 本身不会自动配置或读取 App 中的 Key。

HTTP 地址、九项操作、请求格式及错误处理见
[HTTP API 说明](references/http-api.md)。助手需要能执行 HTTPS 请求并使用所配置的凭据。

### 可选：Remote MCP

如果更希望使用 MCP，或助手只能通过 MCP 连接外部服务，可自行添加：

- 名称：`anke-money`
- 类型：Streamable HTTP
- 地址：`https://azfzepi6zekanwh2.azurewebsites.net/mcp`
- 认证：Bearer Token，填写同一个 API Key

填写 Key 的具体界面取决于客户端。HTTP 和 MCP 使用同一权限、Pro、幂等及审计边界；
认证或权限失败时不会自动切换通道绕过检查。

API Key 由 Anke Money App 创建，不包含在本仓库或安装命令中。请勿把 API Key
提交到 GitHub、写入提示词或分享给其他人；如怀疑泄露，请在 App 中重置 Key。

## 支持的能力

- 查看收支
- 分页读取一段时间的收支与资产数据，用于 Agent 自行分析和可视化
- 记录一笔，或在一次确认后分批记录账单文档中的多笔收支
- 在一次确认后，将已有支出分摊到 2–120 个月；Skill 写入经过校验的每月分摊记录，保留原始支付记录
- 查看资产
- 在确认后刷新股票、基金/ETF、数字资产和贵金属的当前价格与价值，并通过对应专业交易平台估算固定资产（房产、车辆等）和兴趣/收藏资产的当前总价值；现金及固定收益等直接录入类资产仍需用户提供信息
- 新增一个资产账户，或一次确认后批量新增资产账户及初始快照
- 更新资产
- 查看账单分类
- 查看支付渠道

支出可以不选支付渠道，显示为“其他”；收入不关联支付渠道。如果分类列表与 App
不一致，应先让更新后的 App 完成同步，再重新读取。Skill 不会重建缺失分类，
也不会因此更改历史账目的分类。

写入账目、新增资产和更新资产前，Skill 会展示拟执行的变更并要求用户明确确认。账单文档只在
Agent 侧解析，Anke Money 只接收确认后的结构化条目。Skill 不提供永久删除、修改历史
账目、批量更新已有资产、整批撤销、授权管理或跨账户访问。市场行情和可比估值由 Agent
侧查询，固定资产和兴趣资产优先使用对应专业平台；确认前必须说明来源、时间、估值方式、
置信度、报价币种和汇率假设。

## 仓库内容

- `SKILL.md`：Agent 工作流与安全边界
- `agents/openai.yaml`：Skill 展示信息，不强制依赖 MCP
- `references/http-api.md`：默认 HTTP 调用方式及可选 MCP 配置
- `references/capabilities.md`：六个权限范围、九项操作的参数和返回约定

后端服务、部署配置、用户数据和任何凭据均不在本仓库中。

## 当前环境

本软件包默认连接 Anke Money Production Agent HTTP API，可选连接 Production MCP。
地址见 `references/http-api.md`；用户数据和 API Key 不存储在本仓库中。
实际使用需要 Anke Money 账户、有效的 Pro 权益，以及在 App 内创建的 API Key。

产品介绍与法律文档请访问
[money.anke-ai.com](https://money.anke-ai.com)。

兴趣资产读取会返回已有的在用、闲置与已售出状态及售出记录。已售物品保留历史，
不纳入正常估值更新方案；记录、修正或撤销售出仍由所有者在 App 中操作。

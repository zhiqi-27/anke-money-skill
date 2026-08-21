# Anke Money Agent Skill

让支持 Agent Skills 和 Remote MCP 的 AI 助手，在用户授权后安全读取和更新 Anke Money 数据。

## 安装

```bash
npx skills add zhiqi-27/anke-money-skill --skill anke-money-agent -g
```

安装完成后，重新打开或刷新所使用的 AI 助手，使其发现 `anke-money-agent`。

## 连接 Anke Money

1. 在 Anke Money 中登录并进入 `Anke Skill` 页面。
2. 创建或复制 API Key。
3. 按 AI 助手的 MCP 配置提示连接 `anke-money`，并使用该 API Key 完成认证。

API Key 由 Anke Money App 创建，不包含在本仓库或安装命令中。请勿把 API Key
提交到 GitHub、写入提示词或分享给其他人；如怀疑泄露，请在 App 中重置 Key。

## 支持的能力

- 查看收支
- 分页读取一段时间的收支与资产数据，用于 Agent 自行分析和可视化
- 记录一笔，或在一次确认后分批记录账单文档中的多笔收支
- 查看资产
- 新增一个资产账户，或一次确认后批量新增资产账户及初始快照
- 更新资产
- 查看账单分类
- 查看支付渠道

写入账目、新增资产和更新资产前，Skill 会展示拟执行的变更并要求用户明确确认。账单文档只在
Agent 侧解析，Anke Money 只接收确认后的结构化条目。Skill 不提供永久删除、修改历史
账目、批量更新已有资产、整批撤销、授权管理或跨账户访问。

## 仓库内容

- `SKILL.md`：Agent 工作流与安全边界
- `agents/openai.yaml`：Skill 展示信息与 Remote MCP 依赖
- `references/capabilities.md`：六个权限范围、九个工具的参数和返回约定

后端服务、部署配置、用户数据和任何凭据均不在本仓库中。

## 当前环境

当前 Skill 连接 Anke Money Development MCP 服务，适合开发和测试。正式发布前会切换到
Production 服务地址。

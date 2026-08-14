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
- 记录一笔
- 查看资产
- 更新资产
- 查看账单分类
- 查看支付渠道

记录一笔和更新资产前，Skill 会展示拟执行的变更并要求用户明确确认。Skill 不提供
永久删除、修改历史账目、授权管理、账单导入或跨账户访问。

## 仓库内容

- `SKILL.md`：Agent 工作流与安全边界
- `agents/openai.yaml`：Skill 展示信息与 Remote MCP 依赖
- `references/capabilities.md`：六项能力的参数和返回约定

后端服务、部署配置、用户数据和任何凭据均不在本仓库中。

## 当前环境

当前 Skill 连接 Anke Money Development MCP 服务，适合开发和测试。正式发布前会切换到
Production 服务地址。

# Anke Money Skill

[English](README.md) · [中文](README.zh-CN.md)

Let AI assistants that support Agent Skills and Remote MCP securely read and
update Anke Money data after the user authorizes the connection.

## Installation

```bash
npx skills add zhiqi-27/anke-money-skill --skill anke-money-agent -g
```

After installation, reopen or refresh the AI assistant so it discovers
`anke-money-agent`.

## Connect Anke Money

1. Sign in to Anke Money and open the `Anke Money Skill` page.
2. Create or copy an API Key.
3. Follow the AI assistant's MCP configuration instructions to connect
   `anke-money`, then authenticate with that API Key.

The API Key is created by the Anke Money app and is never included in this
repository or the installation command. Do not commit it to GitHub, put it in a
prompt, or share it with anyone. If you suspect it was exposed, reset the Key
in the app.

## Supported capabilities

- View income and spending
- Read paginated ledger and asset data for an Agent to analyze and visualize
- Record one entry, or batch-record multiple income and spending entries from a
  bill document after one confirmation
- View assets
- Create one asset account, or batch-create asset accounts and initial snapshots
  after one confirmation
- Update an asset
- View ledger categories
- View payment channels

Before writing ledger entries, creating assets, or updating assets, the Skill
shows the proposed changes and requires explicit confirmation. Bill documents
are parsed on the Agent side; Anke Money receives only the confirmed structured
entries. The Skill does not provide permanent deletion, ledger-history edits,
bulk updates to existing assets, batch rollback, authorization management, or
cross-account access.

## Repository contents

- `SKILL.md`: Agent workflow and safety boundaries
- `agents/openai.yaml`: Skill display metadata and Remote MCP dependency
- `references/capabilities.md`: six capability scopes and the parameter and
  response contracts for nine tools

The backend service, deployment configuration, user data, and all credentials
are kept out of this repository.

## Current environment

Released installations of this Skill connect to the Anke Money Production MCP
service. The endpoint is configured in `agents/openai.yaml`; user data and API
Keys are not stored in this repository.

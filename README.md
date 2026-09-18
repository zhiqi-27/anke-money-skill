# Anke Money Skill

[English](README.md) · [中文](README.zh-CN.md)

Let AI assistants that support Agent Skills and Remote MCP securely read and
update Anke Money data after the user authorizes the connection.

Anke Money itself is a personal and household finance record for income,
spending, budgets, assets, liabilities, receivables, and net worth. The Skill is
an optional Anke Money Pro capability; it is not an autonomous financial adviser
or a bank connection.

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
- Allocate an existing expense across 2–120 months after one confirmation; the
  Skill writes the verified monthly allocation rows and preserves the original
  payment
- View assets
- Refresh current prices and values for confirmed stocks, funds/ETFs, digital
  assets, and precious metals; estimate confirmed totals for living fixed assets
  and interest/collectible assets from category-specific specialist platforms;
  cash and direct financial-value categories remain owner-entered
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
cross-account access. Market quote and comparable-estimate lookup is performed by
the Agent host and must disclose its specialist source, timestamp, method,
confidence, quote currency, and any FX assumption.

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

Anke Money 1.0 is publicly available on the App Store. Version 1.1 (Build 9) is
ready to be packaged from the current app source, but it has not been uploaded
or submitted for review. The Skill package is available independently, but
using it requires an Anke Money account, an active Anke Money Pro entitlement,
and an API Key created inside the app.

Product information and legal documents are available at
[money.anke-ai.com](https://money.anke-ai.com).

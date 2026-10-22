# Anke Money Skill

[English](README.md) · [中文](README.zh-CN.md)

Let AI assistants with Agent Skills, HTTPS requests and secure credential settings
read and update authorized Anke Money data. Direct HTTP is the default; Remote MCP
is optional.

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

## Configure the API Key

1. After installation, tell the assistant: **“Help me set up Anke Money Skill.”**
2. Create or copy the API Key on the App's `Anke Money Skill` page. Active Pro is required.
3. The assistant gives you the setup command with the actual installed path. Run
   it in a terminal, paste the Key into the **hidden prompt**, and press Enter.
   Validation and OS-vault storage are automatic; no config editing or MCP entry.
4. Ask “Review this month's income and spending.” The client reads the saved Key
   automatically. Every write still requires a complete proposal and your approval.

The setup command uses Node.js 20+, with no npm dependencies:

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" setup
```

macOS uses Keychain; Windows uses Credential Manager. Linux needs `secret-tool`
and an unlocked Secret Service session. Requests must run as the same OS user
with vault access. See [wizard and client](references/client-setup.md). Installing
a Skill does not open a popup, run setup or retrieve the App's Key on its own.

Cloud/headless/sandboxed hosts without vault access retain the secure host setting
`ANKE_MONEY_API_KEY` and the same direct HTTP API. An explicit host setting takes
precedence, with no fallback to another Key on failure. A host needs HTTPS and
secure credential injection; plaintext Key files are never used. Do not paste a
Key in chat. An export in another terminal does not update a running assistant.

See [HTTP API](references/http-api.md) for the endpoint, nine operations, request
formats and error handling. The host needs HTTPS execution and secret injection.

### Optional Remote MCP

If you prefer MCP, or the host connects to external services only through MCP,
manually add a Streamable HTTP server named `anke-money` with URL
`https://azfzepi6zekanwh2.azurewebsites.net/mcp` and use the same API Key as a
Bearer token. The credential input depends on the client. HTTP and MCP retain the
same scope, Pro, idempotency and audit boundaries; authentication or permission
errors must not trigger automatic transport switching to bypass checks.

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

An expense can be recorded without a payment channel (“Other” / 其他); income
has no channel. If the category list differs from the App, let the updated App
finish synchronization and read it again. The Skill does not recreate missing
categories or change historical category assignments.

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
- `agents/openai.yaml`: Skill display metadata, without a mandatory MCP dependency
- `references/http-api.md`: default HTTP calls and optional MCP setup
- `scripts/anke-money.mjs`: hidden-input setup, connection check, reads and confirmed writes
- `references/client-setup.md`: cross-platform credentials and client commands
- `references/capabilities.md`: six capability scopes and the parameter and
  response contracts for nine operations

The backend service, deployment configuration, user data, and all credentials
are kept out of this repository.

## Current environment

This package defaults to the Production Agent HTTP API, with Production MCP
optional. Endpoints are documented in `references/http-api.md`; user data and
API Keys are not stored here. Usage requires an Anke Money account, an active Pro
entitlement and an API Key created inside the app.

Product information and legal documents are available at
[money.anke-ai.com](https://money.anke-ai.com).

Interest asset reads include held/idle/sold lifecycle information when available.
Sold items retain history and are excluded from normal valuation proposals;
recording or correcting sales remains an App-owner operation.

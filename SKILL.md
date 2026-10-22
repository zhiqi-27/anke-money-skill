---
name: anke-money-agent
description: Safely read and update one authorized Anke Money household through its HTTP API, with Remote MCP optional. Use for ledger or asset analysis, confirmed bill imports, expense allocation, asset creation or valuation updates. Requires an API Key and enforces write confirmation, idempotency, pagination and revision checks.
---

# Anke Money Skill

Use the Agent HTTP API by default through the bundled Node.js 20+ client
`scripts/anke-money.mjs` (no npm dependencies). Resolve its absolute path from this
installed Skill, not the current working directory or a guessed install path.
Run `node "<absolute-skill-path>/scripts/anke-money.mjs" status` first. If unconfigured,
ask the user to create/copy their Key in Anke Money and run the same script with
`setup` in a real terminal. Give them the exact quoted command; open a user-operated
terminal when the host supports it. The terminal prompt hides input, checks Key/Pro
without reading financial records and saves to the system credential store. Never
ask for the Key in chat, accept it as a command argument, or type it on the user's
behalf. Installing the Skill does not run setup or retrieve a Key from the App.

Later calls automatically read that store for the same OS user. On a headless or
cloud host, or one without Node/system-vault access, retain direct HTTPS with
`ANKE_MONEY_API_KEY` in the host's own secret settings. An existing variable takes
precedence; never silently replace/fall back from it. A terminal export does not
update an already-running desktop/cloud host. No plaintext credential-file fallback,
MCP configuration edit or automatic credential rotation. Platform requirements and
the setup/check/read/preview/confirm commands are in
[client-setup.md](references/client-setup.md).

Before making HTTP requests, read [http-api.md](references/http-api.md) for the
fixed Production origin, route map, JSON field names and error handling. The
operation names below identify capabilities; HTTP does not call MCP tool names.
Use only the listed Agent endpoints, never owner/admin/sync/database APIs.

An already configured Remote MCP connection is optional; use it when the user
chooses MCP or the host cannot execute HTTP requests. Its setup is documented in
[http-api.md](references/http-api.md#optional-remote-mcp). Do not automatically
configure MCP or switch transports after an authentication, permission, validation
or write failure. Preserve IDs and idempotency keys if an unchanged retry changes
transport at the user's request. If neither path is available, stop and explain
the missing host capability.

Both paths use the same revocable owner-created Key, one household, six scopes and
nine operations. External market or comparable-estimate lookup remains in the
Agent host under the source, privacy and confirmation rules below.

## Workflow

1. Match the request to one or more of the nine operations in
   [capabilities.md](references/capabilities.md).
2. Use read tools to resolve stable category, channel, account, or ledger IDs.
   Never guess an ID. Follow `nextCursor` until `hasMore` is false when the task
   needs the complete requested period.
   An expense may omit its payment channel or use `null` (“Other” / 其他);
   income has no channel. Never invent a channel to make an entry writable.
   A short category list does not prove the account has no other categories.
   If an expected category is missing, ask the owner to let the updated App
   complete synchronization, then read again. Do not guess an ID, recreate
   categories, or remap historical entries to bypass missing reference data.
3. Before `ledger_create`, `ledger_create_batch`, `assets_create`, `assets_create_batch`, or `assets_update`, show the proposed change and ask
   for explicit confirmation. Do not treat an earlier general request as that
   confirmation. With the bundled client, first call `request` with the complete
   camelCase JSON body file and no `--confirm` to obtain a no-network preview and
   SHA-256 confirmation value. Show the complete proposal to the user; only after
   their explicit confirmation repeat that exact request with `--confirm <hash>`.
   Any changed body, IDs, account, operation or revision needs a new preview and
   confirmation. The hash is a content lock, not proof of human consent. One
   confirmed full batch/schedule may cover its unchanged chunks. Hosts using direct
   HTTPS must enforce the same human-confirmation boundary themselves.
4. For “更新下我当前的资产情况” (or an equivalent request), first retrieve all
   pages from `assets_read`. Treat each `assetAccount` as the current account and
   use its latest dated snapshot for the comparison. For interest assets, read
   `payload.interestLifecycle.status` (missing means `inUse`). Both `inUse` and
   `idle` remain held; exclude `sold` items from current held totals and valuation
   proposals while retaining their history. Do not use net sale proceeds as a
   valuation or automatically record income. Lifecycle changes are App-owner
   operations, outside the Agent tools. Include both of these
   refreshable groups:
   - Quantity-valued financial assets: stocks, funds/ETFs, digital assets, and
     precious metals. Prefer a stored product code or specific financial asset
     type. Treat `crypto.other` and `metal.other` as non-specific: search those
     account names too. If an identifier is absent or non-specific, show the
     possible product, market, quote currency, and confidence and ask the owner
     to confirm the match. Do not guess an ambiguous product.
   - Direct-value market assets: `asset_group=living` (real estate, vehicles,
     and other fixed assets) and `asset_group=interest` (photography, watches,
     bags, sneakers, and other interest/collectible assets). Search the account
     name plus only relevant, non-sensitive descriptors already present in the
     account, such as coarse location and area, vehicle model/condition/mileage,
     purchase date/cost, or item condition. Use a category-specific specialist
     marketplace, exchange, or completed-transaction source for the estimate;
     do not treat an unrelated generic result as a quote. Present candidates or
     comparable ranges when identity or condition is uncertain and ask the owner
     to confirm. If the evidence is insufficient, skip the account and ask for
     the missing information.
5. For each refresh, record the provider/source (prefer a specialist platform
   for living and interest assets), source link when available, as-of time,
   quote/estimate currency, method (listing, completed transaction, index, or
   other comparable), confidence, and any explicit FX assumption. For financial
   assets, calculate the new total as held quantity × unit price using the
   account currency's integer minor unit and show old/new unit price and total.
   For living and interest assets, do not invent a quantity or unit price: use a
   confirmed estimated total only. For every account show the old and new total,
   absolute change, and percentage change when the prior value is non-zero.
   Cash, liquid funds, money-market funds, deposits, insurance, private equity,
   fixed income, bonds, receivables, and other direct-value financial categories
   are not estimated; ask the owner for the missing information instead. In this
   rule, “fixed assets” means `living`; it does not include “fixed income”.
   Do not send an exact property address, private notes, or asset images to an
   external search provider unless the owner explicitly authorizes it; use a
   coarse location or a user-provided image only when necessary and permitted.
6. Show one complete proposal for every confirmed financial, fixed-asset, and
   interest-asset update and ask for immediate explicit confirmation. Immediately
   before each write, use the account revision returned by the latest read as
   `expected_revision`; if the server reports a revision conflict, stop that
   account, re-read it, and ask for a new confirmation rather than overwriting
   it. Call `assets_update` once per account with a fresh snapshot UUID and
   idempotency UUID. For living and interest assets, send the confirmed total in
   `amount_in_fen` and omit quantity/unit-price valuation fields. Report
   accepted, replayed, conflicted, and skipped accounts separately.
7. For an existing expense the owner asks to allocate across months, first use
   `ledger_read` to resolve exactly one source entry and retrieve all rows linked
   to it. For a new schedule, the source must have no existing allocations; do not
   allocate an income, an allocation row, or a source with a conflicting schedule. Propose
   the complete 2–120 month schedule, using integer minor units: divide the source amount
   evenly and put the remainder in the first month. Each child keeps the source's
   kind, channel, category, note, and currency, uses the matching month as both
   `occurred_at`/`month_start`, and carries `allocation_source_id`,
   `allocation_index`, `allocation_count`, and `allocation_start_month`. Show the
   source, every child amount, total, first-month remainder, and start month, then
   obtain one explicit confirmation. Call `ledger_create_batch` in unchanged
   chunks of at most 25 children. If a transport failure leaves a partial schedule,
   report exactly which children were accepted and resume only unchanged missing
   children after re-reading the source and existing allocation rows; there is no
   rollback tool.
8. For an uploaded bill document, parse it locally in the Agent host, resolve
   categories and channels, and show one complete summary including entry count,
   income total, expense total, date range, and any uncertain rows. Never send
   the raw document to Anke Money. Obtain explicit confirmation for the complete
   proposed batch, then call `ledger_create_batch` in unchanged chunks of at most
   25 entries.
9. Before creating assets from a document, retrieve every existing account and the
   active asset categories. Do not infer that a similarly named account is the same
   account. Show the complete proposed new-account batch, including name, kind,
   asset group, category, money bucket when applicable, initial amount, and observed
   date. After one explicit confirmation, call `assets_create_batch` in unchanged
   chunks of at most 25 accounts. Keep updates to existing accounts separate.
10. Give every new ledger entry its own entity UUID and idempotency UUID. Give every
   new asset account its own account UUID, initial snapshot UUID, and idempotency
   UUID. Reuse an
   idempotency key only when retrying the exact same entry with every argument
   unchanged. Reuse the unchanged chunk when retrying a batch.
11. Report created and replayed results. For multi-page reads, state the requested
   period and whether every page was retrieved before analyzing the data.

## Safety boundaries

- Use only the nine documented Agent operations, through HTTP or optional MCP.
- Never request, infer, or switch to another household.
- Never permanently delete, change authorization, upload a raw bank or payment
  statement to Anke Money, update ledger history, or perform an unconfirmed bulk asset change.
- `ledger_create` appends one entry. Do not represent it as editing history.
- `ledger_create_batch` appends 1 through 25 independently idempotent entries.
  It creates no import history, batch rollback, or editable server-side job. For
  an allocation child, the server verifies the source expense, inherited fields,
  month/index, and exact integer amount before accepting it; the complete schedule
  is still a sequence of independently committed rows.
- Allocation metadata is all-or-none and is valid only for an expense: the source
  must already exist, `allocation_count` is 2 through 120, and the child amount
  must equal the source amount divided across that schedule (first-month remainder).
  Dependent allocation rows are read-only in the App; schedule changes go through
  the source expense's App flow, and the Skill cannot edit or delete them. Do not
  reuse an existing allocation index with a new ID.
- `assets_create` atomically creates one account and its initial dated snapshot.
- `assets_create_batch` creates 1 through 25 independently idempotent account and
  initial-snapshot pairs. It does not update existing accounts or create rollback history.
- `assets_update` changes exactly one account by appending one dated snapshot. It
  requires the account revision from the latest `assets_read`. For a
  quantity-valued financial asset, send the decimal-string quantity, unit price,
  and unit together; the server verifies their calculated non-negative total in
  the supplied account currency. For `living` and `interest` direct-value
  assets, send the confirmed non-negative total only and omit valuation fields;
  the purchase amount is historical context, not the current value. Optional
  product code, financial asset type, and stock market metadata are validated
  against the account category.
- Keep money in integer currency minor units (CNY fen for legacy households).
  Confirm the household accounting currency before creates and preserve the
  existing account currency for updates. Reject floating-point money and do not
  silently convert currencies or assume every currency has two decimal places.
- Quote and comparable-estimate discovery is an Agent-host responsibility. For
  living and interest assets, prefer a category-specific specialist platform or
  completed-transaction source. Never invent a quote or hide its source,
  timestamp, currency, method, confidence, or FX assumption in a write proposal.
- Do not put credentials, access tokens, private notes, exact property addresses,
  asset images, or unrelated record payloads into prompts, summaries, or logs
  unless the owner explicitly authorizes the minimum required information.
- If the API Key is invalid or revoked, stop and ask the user to create or reset it
  in Anke Money. Never work around it.

Load [capabilities.md](references/capabilities.md) when choosing an operation or
constructing its arguments.

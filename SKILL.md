---
name: anke-money-agent
description: Safely transfer and update one user-authorized Anke Money household through its Remote MCP tools. Use when a user asks to read or visualize financial data, turn an uploaded document into confirmed ledger entries or asset accounts, create ledger entries, allocate an existing expense across months, create asset accounts, update one asset balance, or refresh market-valued assets with current quotes or category-specific comparable estimates. Enforces confirmation before writes, stable idempotency keys, pagination, revision checks, and narrow non-destructive operations.
---

# Anke Money Skill

Use the connected Anke Money MCP server as the only path for Anke Money data.
External market or comparable-estimate lookup may happen in the Agent host only
under the source, privacy, and confirmation rules below. The connection uses the
owner's long-lived Anke Money API Key, which binds one identity and one household
and enables all six Agent scopes through nine tools. It remains valid until the
owner resets or revokes it.

## Workflow

1. Match the request to one or more of the nine tools in
   [capabilities.md](references/capabilities.md).
2. Use read tools to resolve stable category, channel, account, or ledger IDs.
   Never guess an ID. Follow `nextCursor` until `hasMore` is false when the task
   needs the complete requested period.
3. Before `ledger_create`, `ledger_create_batch`, `assets_create`, or `assets_update`, show the proposed change and ask
   for explicit confirmation. Do not treat an earlier general request as that
   confirmation.
4. For “更新下我当前的资产情况” (or an equivalent request), first retrieve all
   pages from `assets_read`. Treat each `assetAccount` as the current account and
   use its latest dated snapshot for the comparison. Include both of these
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
   the complete 2–120 month schedule, using integer fen: divide the source amount
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

- Use only the nine tools exposed by the active connection.
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
- Keep money in integer fen. Reject floating-point currency values.
- Quote and comparable-estimate discovery is an Agent-host responsibility. For
  living and interest assets, prefer a category-specific specialist platform or
  completed-transaction source. Never invent a quote or hide its source,
  timestamp, currency, method, confidence, or FX assumption in a write proposal.
- Do not put credentials, access tokens, private notes, exact property addresses,
  asset images, or unrelated record payloads into prompts, summaries, or logs
  unless the owner explicitly authorizes the minimum required information.
- If the API Key is invalid or revoked, stop and ask the user to create or reset it
  in Anke Money. Never work around it.

Load [capabilities.md](references/capabilities.md) when choosing a tool or
constructing its arguments.

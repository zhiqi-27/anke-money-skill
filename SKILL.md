---
name: anke-money-agent
description: Safely transfer and update one user-authorized Anke Money household through its Remote MCP tools. Use when a user asks to read or visualize financial data, turn an uploaded document into confirmed ledger entries or asset accounts, create ledger entries, create asset accounts, update one asset balance, or refresh market-valued assets with current quotes. Enforces confirmation before writes, stable idempotency keys, pagination, revision checks, and narrow non-destructive operations.
---

# Anke Money Skill

Use the connected Anke Money MCP server as the only data path. The connection
uses the owner's long-lived Anke Money API Key, which binds one identity and one
household and enables all six Agent scopes through nine tools. It remains valid until the owner
resets or revokes it.

## Workflow

1. Match the request to one or more of the nine tools in
   [capabilities.md](references/capabilities.md).
2. Use read tools to resolve stable category, channel, account, or ledger IDs.
   Never guess an ID. Follow `nextCursor` until `hasMore` is false when the task
   needs the complete requested period.
3. Before `ledger_create`, `assets_create`, or `assets_update`, show the proposed change and ask
   for explicit confirmation. Do not treat an earlier general request as that
   confirmation.
4. For “更新下我当前的资产情况” (or an equivalent request), first retrieve all
   pages from `assets_read`. Treat each `assetAccount` as the current account and
   use its latest dated snapshot for the comparison. Automatically quote only
   stocks, funds/ETFs, digital assets, and precious metals—the categories whose
   quantity and unit price are exposed. Use a stored product code or specific
   financial asset type first. Treat `crypto.other` and `metal.other` as
   non-specific: search those account names too. If an identifier is absent or
   non-specific, search by the account name in the Agent host, show the possible
   product, market, quote currency, and confidence, and ask the owner to confirm
   the match. Do not guess an ambiguous product.
5. For each market quote, record the provider/source, as-of time, quote currency,
   and any explicit FX assumption. Calculate the new total as held quantity ×
   unit price using the account currency's integer minor unit, and show the old
   and new unit price, total, absolute change, and percentage change when the
   prior value is non-zero. Cash, liquid funds, money-market funds, deposits,
   insurance, private
   equity, fixed income, bonds, receivables, and other direct-value categories
   are not estimated; ask the owner for the missing information instead.
6. Show one complete proposal for every confirmed market-asset update and ask
   for immediate explicit confirmation. Immediately before each write, use the
   account revision returned by the latest read as `expected_revision`; if the
   server reports a revision conflict, stop that account, re-read it, and ask
   for a new confirmation rather than overwriting it. Call `assets_update` once
   per account with a fresh snapshot UUID and idempotency UUID. Report accepted,
   replayed, conflicted, and skipped accounts separately.
7. For an uploaded bill document, parse it locally in the Agent host, resolve
   categories and channels, and show one complete summary including entry count,
   income total, expense total, date range, and any uncertain rows. Never send
   the raw document to Anke Money. Obtain explicit confirmation for the complete
   proposed batch, then call `ledger_create_batch` in unchanged chunks of at most
   25 entries.
8. Before creating assets from a document, retrieve every existing account and the
   active asset categories. Do not infer that a similarly named account is the same
   account. Show the complete proposed new-account batch, including name, kind,
   asset group, category, money bucket when applicable, initial amount, and observed
   date. After one explicit confirmation, call `assets_create_batch` in unchanged
   chunks of at most 25 accounts. Keep updates to existing accounts separate.
9. Give every new ledger entry its own entity UUID and idempotency UUID. Give every
   new asset account its own account UUID, initial snapshot UUID, and idempotency
   UUID. Reuse an
   idempotency key only when retrying the exact same entry with every argument
   unchanged. Reuse the unchanged chunk when retrying a batch.
10. Report created and replayed results. For multi-page reads, state the requested
   period and whether every page was retrieved before analyzing the data.

## Safety boundaries

- Use only the nine tools exposed by the active connection.
- Never request, infer, or switch to another household.
- Never permanently delete, change authorization, upload a raw bank or payment
  statement to Anke Money, update ledger history, or perform an unconfirmed bulk asset change.
- `ledger_create` appends one entry. Do not represent it as editing history.
- `ledger_create_batch` appends 1 through 25 independently idempotent entries.
  It creates no import history, batch rollback, or editable server-side job.
- `assets_create` atomically creates one account and its initial dated snapshot.
- `assets_create_batch` creates 1 through 25 independently idempotent account and
  initial-snapshot pairs. It does not update existing accounts or create rollback history.
- `assets_update` changes exactly one account by appending one dated snapshot. It
  requires the account revision from the latest `assets_read`. For a
  quantity-valued financial asset, send the decimal-string quantity, unit price,
  and unit together; the server verifies their calculated non-negative total in
  the supplied account currency. Optional product code, financial asset type,
  and stock market metadata are validated against the account category.
- Keep money in integer fen. Reject floating-point currency values.
- Quote discovery is an Agent-host responsibility. Never invent a quote or hide
  its source, timestamp, currency, or FX assumption in a write proposal.
- Do not put credentials, access tokens, private notes, or unrelated record
  payloads into prompts, summaries, or logs.
- If the API Key is invalid or revoked, stop and ask the user to create or reset it
  in Anke Money. Never work around it.

Load [capabilities.md](references/capabilities.md) when choosing a tool or
constructing its arguments.

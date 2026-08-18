---
name: anke-money-agent
description: Safely transfer and update one user-authorized Anke Money household through its Remote MCP tools. Use when a user asks to read a period of ledger or asset data, analyze or visualize personal finances, turn an uploaded bill document into confirmed ledger entries, create one ledger entry, or update one asset balance. Enforces confirmation before writes, stable idempotency keys, pagination, and narrow non-destructive operations.
---

# Anke Money Agent

Use the connected Anke Money MCP server as the only data path. The connection
uses the owner's long-lived Anke Money API Key, which binds one identity and one
household and enables all six Agent scopes through seven tools. It remains valid until the owner
resets or revokes it.

## Workflow

1. Match the request to one or more of the seven tools in
   [capabilities.md](references/capabilities.md).
2. Use read tools to resolve stable category, channel, account, or ledger IDs.
   Never guess an ID. Follow `nextCursor` until `hasMore` is false when the task
   needs the complete requested period.
3. Before `ledger_create` or `assets_update`, show the proposed change and ask
   for explicit confirmation. Do not treat an earlier general request as that
   confirmation.
4. For an uploaded bill document, parse it locally in the Agent host, resolve
   categories and channels, and show one complete summary including entry count,
   income total, expense total, date range, and any uncertain rows. Never send
   the raw document to Anke Money. Obtain explicit confirmation for the complete
   proposed batch, then call `ledger_create_batch` in unchanged chunks of at most
   25 entries.
5. Give every new entry its own entity UUID and idempotency UUID. Reuse an
   idempotency key only when retrying the exact same entry with every argument
   unchanged. Reuse the unchanged chunk when retrying a batch.
6. Report created and replayed results. For multi-page reads, state the requested
   period and whether every page was retrieved before analyzing the data.

## Safety boundaries

- Use only the seven tools exposed by the active connection.
- Never request, infer, or switch to another household.
- Never permanently delete, change authorization, upload a raw bank or payment
  statement to Anke Money, update ledger history, or perform a bulk asset update.
- `ledger_create` appends one entry. Do not represent it as editing history.
- `ledger_create_batch` appends 1 through 25 independently idempotent entries.
  It creates no import history, batch rollback, or editable server-side job.
- `assets_update` changes exactly one account by appending one dated snapshot.
- Keep money in integer fen. Reject floating-point currency values.
- Do not put credentials, access tokens, private notes, or unrelated record
  payloads into prompts, summaries, or logs.
- If the API Key is invalid or revoked, stop and ask the user to create or reset it
  in Anke Money. Never work around it.

Load [capabilities.md](references/capabilities.md) when choosing a tool or
constructing its arguments.

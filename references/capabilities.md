# Anke Money capability reference

The MCP connection uses the revocable, long-lived API Key created by the Anke Money
owner. The server derives the connection ID, household ID, all six scopes,
and `skill` operation source from that credential. Never send a household ID or
source as a tool argument.

## Read tools

| Tool | Required scope | Purpose |
| --- | --- | --- |
| `ledger_read` | `ledger:read` | List ledger entries for an optional date interval. |
| `assets_read` | `assets:read` | List asset accounts and dated snapshots for an optional date interval. |
| `categories_read` | `categories:read` | List ledger categories. |
| `channels_read` | `channels:read` | List payment channels. |

`ledger_read` and `assets_read` accept optional inclusive `start_date` and
`end_date` values, an optional opaque `cursor`, and `limit` from 1 through 500.
Their result includes `nextCursor` and `hasMore`. For a complete export or report,
keep the same date interval and pass each returned cursor until `hasMore` is false.
Asset-account metadata is included even when its dated snapshots fall outside the
requested interval. `categories_read` and `channels_read` accept `limit` only.

## `ledger_create`

Required scope: `ledger:create`.

Append exactly one entry. Required arguments are `id`, `idempotency_key`,
`kind`, `direction`, `occurred_at`, `month_start`, `category_id`, and
`amount_in_fen`. `channel_id` is required for an expense and absent for income.
`note` is optional. UUIDs must be new for a new entry. Timestamps include a time
zone, `month_start` is the first calendar day, and the amount is positive integer
fen.

## `ledger_create_batch`

Required scope: `ledger:create`.

Append 1 through 25 entries after one explicit confirmation covering the complete
proposed batch. `entries` contains the same fields as `ledger_create`; every entry
requires a unique entity UUID and idempotency UUID. Larger documents use multiple
unchanged chunks. Retrying an identical chunk returns each entry as created or
replayed without duplication. The raw source document is not a tool argument and
must remain in the Agent host.

## `assets_update`

Required scope: `assets:update`.

Append one dated snapshot to exactly one existing asset account. Required
arguments are `account_id`, `snapshot_id`, `idempotency_key`, `amount_in_fen`,
and timezone-aware `observed_at`. `member_profile_id` is optional. Resolve the
account with `assets_read`; never guess it. A separate confirmed update needs a
new snapshot ID and idempotency key.

## Write receipt and errors

A successful single-write result includes `replayed`. `false` means the write was
accepted; `true` means the exact request already succeeded. A batch result includes
per-entry results plus `createdCount` and `replayedCount`. The server binds an
idempotency key to the full request and connection identity, so changing any
argument while reusing the key is an error.

Invalid or revoked credentials, validation failures, and attempts to update another
household are terminal for that call. Explain the constraint without retrying under
a different tool or credential.

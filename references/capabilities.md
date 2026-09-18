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
requested interval. An asset account may additionally expose its `currencyCode`,
`valuationQuantity`, `valuationUnitPrice`, `valuationUnit`,
`financialAssetTypeId`, `financialProductCode`, and `stockMarketId`. These
metadata fields are optional for older accounts. `categories_read` and
`channels_read` accept `limit` only. Living and interest accounts may also
expose `purchaseAmountMinor`, `purchaseCurrencyCode`, `purchaseDate`,
`assetCondition`, `propertyAreaSquareMeters`, `vehicleModel`,
`vehicleExteriorCondition`, and `vehicleMileageKilometers` for category-specific
comparison. `propertyAddress` is sensitive context: keep it coarse or local and
do not forward the exact value to an external provider without explicit owner
permission.

For a refresh, `crypto.other` and `metal.other` are not a unique product
identity; resolve them by searching the account name and confirming a candidate
before using a quote.

For the same refresh workflow, `asset_group=living` covers direct-value fixed
assets such as real estate and vehicles, and `asset_group=interest` covers
photography, watches, bags, sneakers, and other interest/collectible assets.
These groups do not expose a canonical quantity and unit-price model. The Agent
host may search a category-specific specialist marketplace, exchange, or
completed-transaction source using the account name and relevant safe metadata,
then present the source, as-of time, method, confidence, and currency for owner
confirmation. A confirmed update uses the account's total amount only; it does
not invent valuation quantity or unit-price fields. Exact addresses, private
notes, and images must not be sent to an external provider without explicit
owner permission. `fixed income` remains a financial category that requires
owner-provided information; it is not the `living` fixed-asset group.

## `ledger_create`

Required scope: `ledger:create`.

Append exactly one entry. Required arguments are `id`, `idempotency_key`,
`kind`, `direction`, `occurred_at`, `month_start`, `category_id`, and
`amount_in_fen`. `channel_id` is required for an expense and absent for income.
`note` is optional. UUIDs must be new for a new entry. Timestamps include a time
zone, `month_start` is the first calendar day, and the amount is positive integer
fen. A monthly allocation child may additionally supply all of
`allocation_source_id`, `allocation_index`, `allocation_count`, and
`allocation_start_month`. For the first child of a new schedule, the source ID
must identify an existing expense with no allocations; unchanged retries or
missing chunks may continue that same schedule. The count is 2 through 120, the
index is within that count, and the child's amount and month must match the
source's exact integer schedule. The child inherits the source kind, channel,
category, note, and currency.

## `ledger_create_batch`

Required scope: `ledger:create`.

Append 1 through 25 entries after one explicit confirmation covering the complete
proposed batch. `entries` contains the same fields as `ledger_create`; every entry
requires a unique entity UUID and idempotency UUID. Larger documents use multiple
unchanged chunks. Retrying an identical chunk returns each entry as created or
replayed without duplication. Allocation schedules use the same fields and may be
split into unchanged chunks when the schedule has more than 25 months; the
server validates each child against the existing source and rejects a conflicting
or duplicate index. Partial chunks are independently committed and have no
rollback. The raw source document is not a tool argument and must remain in the
Agent host. In MCP JSON, batch entries use the schema's camelCase names
(`allocationSourceId`, `allocationIndex`, `allocationCount`, and
`allocationStartMonth`); the single `ledger_create` arguments use the snake_case
names shown above.

## `assets_update`

Required scope: `assets:update`.

Append one dated snapshot to exactly one existing asset account. Required
arguments are `account_id`, `snapshot_id`, `idempotency_key`,
`expected_revision`, `amount_in_fen`, and timezone-aware `observed_at`.
`member_profile_id` and `currency_code` are optional; when omitted, the account's
existing currency is preserved. `amount_in_fen` is the materialized total in the
account currency's integer minor unit, not the unit price.

For stocks, funds/ETFs, digital assets, and precious metals, send
`valuation_quantity`, `valuation_unit_price`, and `valuation_unit` together as
decimal strings. The server checks the category-specific unit and verifies that
quantity × unit price (rounded to the currency's minor unit) equals the supplied
total. Optional `financial_product_code`, `financial_asset_type_id`, and
`stock_market_id` update the corresponding identity metadata when valid for the
account category; omitted metadata is preserved. Amounts are non-negative.

For `living` and `interest` direct-value assets, omit all valuation fields and
send only the confirmed total `amount_in_fen`. The purchase amount is historical
context and is not a current-price input.

Read the account with `assets_read` immediately before proposing the write and
pass its `revision` as `expected_revision`. If it conflicts, do not retry the
same proposal: read the account again and ask for a fresh confirmation. Resolve
the account ID; never guess it. A separate confirmed update needs a new snapshot
ID and idempotency key. The Agent host—not this MCP tool—looks up external market
quotes or comparable estimates and must disclose source, as-of time, method,
confidence, quote currency, and any FX assumption before confirmation. For living
and interest assets, prefer specialist platforms and show whether the evidence
is an asking price, completed transaction, index, or another comparable.

For example, a confirmed 10-share CNY stock update at ¥1,234.50 per share uses
`amount_in_fen: 1234500`, `currency_code: "CNY"`,
`valuation_quantity: "10"`, `valuation_unit_price: "1234.5"`,
`valuation_unit: "share"`, and the account's just-read `expected_revision`.
Generate fresh `snapshot_id` and `idempotency_key` UUIDs for that update.

## `assets_create`

Required scope: `assets:update`.

Create exactly one asset account and its initial dated snapshot after explicit
confirmation. First use `assets_read` to avoid accidental duplicates and
`categories_read` to resolve an active compatible asset category. Required
arguments are `account_id`, `snapshot_id`, `idempotency_key`, `name`, `kind`,
`category_id`, `amount_in_fen`, and timezone-aware `observed_at`.

`kind` is `asset` or `liability`. Assets require `asset_group` from `financial`,
`living`, `interest`, or `receivable`; liabilities omit it. Financial assets also
require `money_bucket` from `flexible`, `stable`, or `risk`; every other account
omits it. `member_profile_id` is optional. Amounts are non-negative integer fen.
The category must be active and have the same asset group, or liability scope, as
the proposed account.

## `assets_create_batch`

Required scope: `assets:update`.

Create 1 through 25 new asset accounts after one explicit confirmation covering
the complete proposed batch. `accounts` contains the same fields as
`assets_create`; every item requires unique account, snapshot, and idempotency
UUIDs. Larger documents use multiple unchanged chunks. Retrying an identical
chunk returns each account as created or replayed without duplication. This tool
does not update accounts that already exist.

## Write receipt and errors

A successful single-write result includes `replayed`. Asset creation also returns
the created account and initial snapshot. `false` means the write was
accepted; `true` means the exact request already succeeded. A batch result includes
per-entry results plus `createdCount` and `replayedCount`. The server binds an
idempotency key to the full request and connection identity, so changing any
argument while reusing the key is an error.

Invalid or revoked credentials, validation failures, and attempts to update another
household are terminal for that call. Explain the constraint without retrying under
a different tool or credential.

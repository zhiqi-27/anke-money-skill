# Setup wizard and HTTP client

## First use

After installing the Skill, tell the assistant “帮我配置 Anke Money Skill”. It
resolves this installed Skill's path and supplies the command below with an actual
absolute path. Run it in your terminal, copy the API Key from the Anke Money App,
paste it into the **hidden terminal prompt**, then press Enter:

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" setup
```

Do not paste the Key in chat, a shell command, a JSON file, or a config file. No
assistant config editing, MCP server entry, `export`, or npm package install is
needed for this path. Node.js 20+ must be available in the host executing requests.
Installing a Skill alone does not run a wizard or copy the App's credentials.

Setup validates Key and active Pro access against the fixed Production origin,
then stores it in the OS credential store. This check deliberately requests an
invalid limit, after authentication but before the category handler. It reads no
financial records and does **not** claim to verify every scope. Real operations
still enforce their own scopes. Failure/cancellation before saving preserves an
existing credential. Re-running setup reuses an existing saved Key without a
second paste. A reset Key can be saved with `setup --replace` when the user requests
replacement; the new Key is validated before overwriting the old one.

| Host | Credential store / requirement |
| --- | --- |
| macOS | Keychain via the built-in `/usr/bin/security`; unlock/allow OS access if prompted |
| Windows | Current user's Windows Credential Manager via built-in Windows PowerShell/WinCred |
| Linux desktop | `secret-tool` (libsecret tools) and an unlocked Secret Service session |
| Headless/cloud or sandbox without vault access | Use the host's secure `ANKE_MONEY_API_KEY` setting; the HTTP contract remains usable without these scripts |

The request process must run as the same OS user with access to that vault. A local
Keychain is not automatically available inside a remote container or cloud assistant.
There is no plaintext-file fallback. Linux users without `secret-tool` must install
their distribution's libsecret tools or use the host's secret setting. No packages
or system services are installed by this script.

An explicitly set `ANKE_MONEY_API_KEY` takes precedence over the vault. Setup refuses
to save a shadowed Key; use `check` to verify the existing setting or remove it
yourself before using the wizard. An invalid env Key never falls back to a saved one.

## Subsequent use

These commands work from any directory when the script path is absolute. Quote
paths with spaces, including in PowerShell. JSON output goes to stdout; safe errors
and the hidden setup prompt go to stderr. Never enable HTTP/TLS debug tracing.

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" status
node "<installed-skill-path>/scripts/anke-money.mjs" check
node "<installed-skill-path>/scripts/anke-money.mjs" request categories_read --limit 200
node "<installed-skill-path>/scripts/anke-money.mjs" request ledger_read --start-date 2026-10-01 --end-date 2026-10-31 --limit 200
```

`status` reports only whether a credential is configured and its source; it does
not contact the service or print a Key. `check` repeats the data-free connection
probe. Reads return the API result; follow `nextCursor` with `--cursor` until
`hasMore` is false for a complete requested period. Dates and cursors are URL encoded.
All nine logical operation names map to the routes in [http-api.md](http-api.md).
No arbitrary URL, household override, owner/admin path or custom headers are accepted.

## Writes: preview, human confirmation, send

Use UTF-8 JSON (an optional BOM is accepted) and the camelCase HTTP fields in
[http-api.md](http-api.md). The assistant prepares
the complete proposal with newly assigned entity and idempotency UUIDs once. Body
files contain confirmed structured data only, never the API Key or raw statements.
Put temporary financial proposal files only in a user-authorized private workspace,
keep them out of Git/logs, and retain exact IDs and bodies while outcome is uncertain.

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" request ledger_create --body-file "<private-proposal.json>"
```

Without `--confirm`, this returns the full preview, `sent: false`, and a SHA-256
`confirmation` value. It neither loads a credential nor sends a request. **Display
the complete proposal and wait for the user's explicit approval.** Only then run:

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" request ledger_create --body-file "<same-private-proposal.json>" --confirm "<preview-confirmation-hash>"
```

For `assets_update`, also pass `--account-id <UUID-from-assets-read>` and the latest
account `expectedRevision` in the body before previewing. Batch bodies use `entries`
or `accounts` with 1–25 items, each retaining its own `idempotencyKey`. One complete
human approval may cover multiple unchanged batch previews/chunks. The content hash
does not authenticate a human or replace the Skill's confirmation workflow.

The client never generates IDs, changes financial units, retries automatically, or
switches transport. A changed amount, ID, account, operation, revision or batch
member invalidates the previous hash. A conflict requires readback and fresh approval
for a changed proposal. A timeout/5xx can mean the write committed; report uncertainty
and retain the exact proposal for a bounded unchanged retry. All server permissions,
Pro checks, currency validation, idempotency and revision rules remain authoritative.

## Remove a local saved credential

Only when the user requests it:

```sh
node "<installed-skill-path>/scripts/anke-money.mjs" forget --yes
```

This removes only this Skill's OS-vault entry. It does not revoke the App Key,
remove host environment settings, or change MCP. Reset a suspected leaked Key in
the App. Do not automatically clear or replace credentials after an API error.

Native interface references: [Node terminal raw mode](https://nodejs.org/api/tty.html#readstreamsetrawmodemode),
[Apple security CLI stdin](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.1),
[Windows WinCred](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew),
and [libsecret CLI](https://github.com/GNOME/libsecret/blob/main/tool/secret-tool.c).

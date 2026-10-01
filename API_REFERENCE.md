# PayMongo CLI API Reference

This document provides a comprehensive technical reference for the PayMongo CLI. It covers all available commands, configuration options, and integration details.

---

## 1. Command Overview

| Command                                   | Description                                               |
| :---------------------------------------- | :-------------------------------------------------------- |
| [`paymongo init`](#paymongo-init)         | Initialize a new PayMongo project and setup credentials.  |
| [`paymongo dev`](#paymongo-dev)           | Receive webhooks in the CLI's local listener via ngrok. |
| [`paymongo payments`](#paymongo-payments) | Manage payments and payment intents.                      |
| [`paymongo payment-methods`](#paymongo-payment-methods) | Create non-card methods and retrieve existing methods. |
| [`paymongo checkout`](#paymongo-checkout) | Create, retrieve, and expire Hosted Checkout Sessions (v1). |
| [`paymongo webhooks`](#paymongo-webhooks) | List, create, and manage PayMongo webhooks.               |
| [`paymongo config`](#paymongo-config)     | View and modify project configuration.                    |
| [`paymongo team`](#paymongo-team)         | Sync configurations with your team via GitHub.            |
| [`paymongo trigger`](#paymongo-trigger)   | Simulate webhook events locally for testing.              |
| [`paymongo login`](#paymongo-login)       | Securely manage your PayMongo API credentials.            |

---

## 2. Detailed Command Reference

### paymongo init

Initialize a new PayMongo project in the current directory. This command sets up the `.paymongo` configuration file and optionally creates a `.env` file.

**Syntax:**

```bash
paymongo init [options]
```

**Options:**
| Option | Description | Default |
| :--- | :--- | :--- |
| `-n, --name <name>` | Project name | Current directory name |
| `-e, --env <environment>` | Environment (`test` or `live`) | `test` |
| `-k, --key <key>` | Secret API key | (Prompted) |
| `--public-key <key>` | Public API key | (Prompted) |
| `-u, --url <url>` | Default webhook URL | `http://localhost:3000/webhook` |
| `-p, --port <port>` | Development server port | `3000` |
| `--events <events>` | Comma-separated events to listen for | `payment.paid,payment.failed` |
| `--non-interactive` | Run without interactive prompts | `false` |

**Examples:**

```bash
# Interactive setup (Recommended)
paymongo init

# Fast setup for CI/CD or automated scripts
paymongo init --non-interactive --key sk_test_... --public-key pk_test_... --env test
```

---

### paymongo dev

Start the CLI's HTTP webhook listener and expose it through `ngrok`. It receives/logs by default; `--forward-to` optionally relays to your application. Do not use a listener port already occupied by your application.

**Syntax:**

```bash
paymongo dev [options]
```

**Options:**
| Option | Description | Default |
| :--- | :--- | :--- |
| `-p, --port <port>` | Port for the CLI's local webhook server | `3000` |
| `--no-register` | Skip automatic webhook registration with PayMongo | `false` |
| `--forward-to <url>` | Application endpoint: loopback HTTP or HTTPS; no embedded credentials/fragments | Disabled |
| `--forward-timeout <ms>` | Application delivery deadline, integer 1–30000 milliseconds | `10000` |
| `-d, --detach` | Run in the background, preserving forwarding options | `false` |
| `-e, --events <events>` | Comma-separated events to listen for | `payment.paid,payment.failed` |
| `--ngrok-token <token>` | Provide ngrok authtoken directly | `NGROK_AUTHTOKEN` |

**Logic:**

1. Starts an `ngrok` tunnel to your specified local port.
2. Starts a local HTTP server at `/webhook` to receive events.
3. Automatically creates a temporary webhook in PayMongo pointing to the tunnel URL (unless `--no-register` is used).
4. Verifies signatures when configured and logs event details. Without forwarding, acknowledges valid requests with HTTP 200.
5. With `--forward-to`, sends original bytes/content type/signature plus a loop-prevention header. Other incoming headers are not copied. Shows downstream status/timing and discards response bodies; never follows redirects or automatically retries.
6. Downstream 2xx → CLI acknowledgment 200; downstream non-2xx or network failure → 502; timeout → 504. Invalid JSON/incomplete requests → 400, configured signature failure → 401, body over 1 MiB → 413, repeated forwarding hop → 508.
7. Disables its temporary webhook during normal shutdown; it does not delete the remote endpoint. Forwarding sockets/in-flight deliveries are closed, with bounded listener shutdown and cleanup attempts even when tunnel/state cleanup fails.

```bash
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo --events checkout_session.payment.paid
```

Forwarding is a local developer feature, not a PayMongo API endpoint or payment
mutation. The app must verify the original signature using the same upstream
webhook secret; the CLI does not re-sign or transfer secrets. A newly registered
temporary webhook can have a different secret. `--no-register` supports an
existing manually configured endpoint/secret; update its public callback as needed.
Receipt analytics remain separate from application-delivery results.
Handle redeliveries idempotently; HTTP acceptance is not proof of fulfillment.

Destination URLs/queries and signature values are not logged or stored in process
state. Status exposes only enablement/timeout. HTTP is limited to `localhost`,
`127.0.0.1`, or `[::1]`; HTTPS uses normal certificate validation.
Direct self/tunnel targets and repeated CLI forwarding hops are rejected.


---

### paymongo payments

Manage and inspect payments and payment intents.

**Subcommands:**

- `paymongo payments list`: List recent payments.
- `paymongo payments show <id>`: Show detailed information for a specific payment.
- `paymongo payments create-intent`: Create a new payment intent.

**`list` Options:**

- `-l, --limit <number>`: Number of payments to show (default: `10`).
- `-j, --json`: Output as raw JSON.

**`show` Options:**

- `-j, --json`: Output as raw JSON.

**`create-intent` Options:**

- `-a, --amount <amount>`: Integer centavos, minimum `100` (default: `10000`).
- `-c, --currency <currency>`: `PHP` only.
- `-d, --description <description>`: Payment description.
- `-m, --methods <methods>`: Comma-separated API method types (default: `card,gcash,paymaya`).
- `--capture-type <type>`: `automatic` (default) or `manual`. Manual capture requires `--methods card`.
- `--three-d-secure <mode>`: `any` or `automatic`, for card payments.
- `-j, --json`: Output as raw JSON.

These flags are identical to `intents create`.

### paymongo intents

```bash
paymongo intents create --amount 50000 --methods card --capture-type manual
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return
paymongo intents show pi_123
paymongo intents capture pi_123 --amount 25000
```

- `create`: Uses `POST /v1/payment_intents` with nested `data.attributes`.
- `attach <intentId>`: Uses `POST /v1/payment_intents/:id/attach`. Requires an existing Payment Method ID unless using local simulation. PayMongo requires `--return-url` for redirect-based methods; supplied URLs must be HTTP(S) without embedded credentials.
- `show <id>`: Retrieves the intent, displays its actual mode, and reports redirect or capture instructions.
- `capture <intentId>`: Captures an authorized card intent. Optional `--amount` is a positive integer for partial capture; omission requests full capture. PayMongo validates the held amount and lifecycle state.
- `cancel <id>`: Cancels an uncaptured authorization through the cancel endpoint.
- `list`: Compatibility notice only; it does not invent a remote list endpoint.

The existing `payments attach`/`confirm` and `payments capture` commands provide the same operations. Manual authorization requires account eligibility/activation and expires after 7 days; see PayMongo's [Hold then capture guide](https://docs.paymongo.com/docs/payment-acceptance-hold-then-capture).

**Local simulation:** `intents attach --simulate --method gcash|maya|grabpay` runs only in the test environment, never calls the payment API, and does not change a real intent. `--delay 0` is supported. JSON output is `{ "simulated": true, "paymentIntent": { ... }, "delayApplied": 0, "simulationType": "..." }`, not an unmarked API resource.

---

### paymongo payment-methods

- `create --type <type>`: `POST /v1/payment_methods`, with `data.attributes`.
  Supported non-card types: `qrph`, `brankas`, `dob`, `billease`, `gcash`, `grab_pay`, `shopee_pay`, `paymaya`.
- `--bank-code <code>`: Sent as `details.bank_code`. Required by this CLI for
  banking methods. DOB: `bpi`, `ubp`, `test_bank_one`, `test_bank_two`;
  Brankas: `bdo`, `metrobank`, `landbank`.
- `--expiry-seconds <seconds>`: Integer expiry after attachment, only for QR Ph
  (`60–9000`) or ShopeePay (`1–3600`).
- `--billing-file <path>`: JSON billing object with optional name/email/phone/address;
  country uses a two-letter uppercase `address.country` code.
- `--metadata-file <path>`: JSON object with string values.
- `show <pm_id>`: `GET /v1/payment_methods/:id`, including existing tokenized cards.

Raw card tokenization is not implemented by this CLI. Create card methods in your
application or use Hosted Checkout; attach returned methods with `intents attach`.
The Payment Method resource has `livemode` and type-specific `details`, not an
invented active/inactive status. Method creation alone does not charge a customer.

### paymongo checkout

These commands use the documented **v1** Checkout lifecycle. The newer hosted
quick-start uses v2; these commands do not claim v2 support.

```bash
paymongo checkout create --amount 50000 --name "Order" --methods card,gcash
paymongo checkout create --items-file items.json --reference-number order-123
paymongo checkout show cs_123 --json
paymongo checkout expire cs_123 --yes --json
```

- `create`: `POST /v1/checkout_sessions`, with `data.attributes.line_items` and
  `payment_method_types`. Supply `--items-file` (JSON array) or `--amount` and
  `--name`, optionally `--quantity` (default 1) and `--currency` (PHP only).
  The CLI requires positive integer unit prices and safe integer total arithmetic.
- Line-item fields: required `amount`, `currency`, `name`, `quantity`; optional
  `description` (max 255 characters), `images` (at most one HTTP(S) URL).
  Maximum 999 items; quantity `1–1000000000`.
- `--methods`: Comma-separated `shopee_pay`, `qrph`, `billease`, `card`, `dob`,
  `dob_ubp`, `brankas_bdo`, `brankas_landbank`, `brankas_metrobank`, `gcash`,
  `grab_pay`, `paymaya`. Default: `card,gcash,paymaya`.
  Bank-specific Checkout names are not interchangeable with Payment Method types.
- Other creation flags: `--description`, `--reference-number`, `--success-url`,
  `--cancel-url`, `--billing-file`, `--metadata-file`, `--send-email-receipt`,
  `--show-description`, `--show-line-items`. Receipt/display flags also support
  `--no-...`; omitted flags leave API defaults intact.
- `show <cs_id>`: `GET /v1/checkout_sessions/:id`.
- `expire <cs_id>`: `POST /v1/checkout_sessions/:id/expire`, without a JSON
  request body. Confirmation defaults to no; `--yes` skips it for scripts.

`active`/`expired` is session availability, not a payment result. The terminal
shows the nested Payment Intent status separately when provided.
Success redirects are not payment proof; cancel redirects do not cancel records.
Expiration disables the URL, not an existing payment or refund.
Subscribe to `checkout_session.payment.paid`; verify its signature and match the
session/order reference before fulfillment.

**Shared safety behavior:** Both groups use configured test/live secret keys.
Channel activation and provider limits are enforced by PayMongo. JSON files are
bounded to 1 MiB and validated without echoing input values. `--json` removes
billing PII, client keys, raw card/CVC fields, and known secret/API-key fields
recursively; it is sanitized resource JSON, not an unredacted API dump.
Creation/expiration requests are not automatically replayed; reads retain silent
transient retries. New commands close their HTTP connection pools on completion
or failure. No standalone list/delete methods or advanced Seeds splits are exposed.

### paymongo payment-links

```bash
paymongo payment-links create --amount 10000 --description "Order #123"
paymongo payment-links show link_123 --json
paymongo payment-links list --limit 10
```

Uses `/v1/payment_links` with top-level create fields. Amount: integer `100`–`999999999` centavos. Currency: uppercase three-letter code. Description is required (maximum 1000 characters). Responses are flat resources with `url`, `active`/`archived` management status, and ISO 8601 timestamps. `--limit` restricts local output from the returned list, not remote pagination. Legacy `/v1/links` response shapes are not used.

### paymongo payments refund

```bash
paymongo payments refund pay_123 --amount 5000 --reason requested_by_customer
```

Both `--amount` and `--reason` are required. The amount must be an integer of at least `100` centavos. Reasons: `duplicate`, `fraudulent`, `requested_by_customer`, `others`. The API determines whether the amount is refundable for that payment.

### paymongo webhooks

Manage your webhooks on the PayMongo platform.

**Subcommands:**

- `paymongo webhooks create`: Create a new webhook.
- `paymongo webhooks list`: List all webhooks in the current environment.
- `paymongo webhooks show <id>`: Show details of a specific webhook.
- `paymongo webhooks disable <id>`: Disable a webhook.
- `paymongo webhooks enable <id>`: Enable a webhook.

**`create` Options:**

- `-u, --url <url>`: Webhook target URL.
- `-e, --events <events>`: Comma-separated event list.

**`list` Options:**

- `-s, --status <status>`: Filter by status (`enabled` or `disabled`).
- `-j, --json`: Output as JSON.

---

### paymongo doctor

Run diagnostics against your local PayMongo CLI setup.

**Checks include:**

- configuration presence and validity
- current environment API key format
- optional live API validation
- ngrok token availability for `paymongo dev`
- webhook URL and signature-verification setup

**Options:**

- `-j, --json`: Output check results as JSON.
- `--no-network`: Skip live PayMongo API validation.

---

### paymongo config

`config show --json` is diagnostic JSON: API keys and webhook signing secrets are
replaced with `[REDACTED]`. It is not a credential export or importable backup.
Protect explicit configuration backup files; those retain their existing contents.

Manage the local `.paymongo` configuration file.

**Subcommands:**

- `paymongo config show`: Display current configuration.
- `paymongo config set <key> <value>`: Set a configuration value (supports dot-notation for nested keys like `dev.port`).
- `paymongo config backup`: Create a backup of your configuration.
- `paymongo config reset`: Reset configuration to defaults.
- `paymongo config import <file>`: Import configuration from a JSON file.

---

### paymongo team

Collaborate with your team by syncing configurations via GitHub.

**Subcommands:**

- `paymongo team sync`: Sync local configuration with the remote repository.
- `paymongo team auth`: Set up GitHub Personal Access Token.

**`sync` Options:**

- `-r, --repo <repo>`: GitHub repository (e.g., `org/repo`).
- `-b, --branch <branch>`: Target branch.
- `-d, --direction <dir>`: Sync direction (`push`, `pull`, or `both`).

---

### paymongo trigger

Send synthetic PayMongo-shaped webhook events directly to a selected endpoint without creating payments. This is a local CLI helper, not PayMongo's real webhook delivery, retry, or test-event API.

Send history marks delivery only after HTTP 2xx; non-2xx and network failures are
recorded as failed. Replay preserves the original payload/record. A delivery label
is not payment proof, and older CLI histories may contain inaccurate labels.

**Syntax:**

```bash
paymongo trigger [options]
```

**Options:**

- `-e, --event <event>`: Event type to simulate.
- `-u, --url <url>`: Target URL to send the mock webhook to (defaults to config).
- `-j, --json`: Output the mock payload to the terminal only.

**Supported Events:**

- `payment.paid`
- `payment.failed`
- `payment.refunded`
- `payment.refund.updated`
- `source.chargeable`
- `checkout_session.payment.paid`
- `link.payment.paid`
- `qrph.expired`

**Example:**

```bash
paymongo trigger --event payment.paid --url http://localhost:3000/webhook
```

---

### paymongo login

Manage your API credentials securely.

**Syntax:**

```bash
paymongo login [options]
```

**Options:**

- `-k, --key <key>`: Secret API key.
- `--public-key <key>`: Public API key.
- `-e, --env <environment>`: Target environment (`test` or `live`).
- `--logout`: Clear all stored credentials.

Keys must match the selected test/live environment before an authenticated request
is made. Non-interactive `--key` does not skip API validation. Interactive password
input avoids putting keys in shell history/process arguments. Validation clients
are closed on success and failure; unreadable/unwritable encryption salt aborts
credential initialization rather than creating unrecoverable encrypted data.

---

## 3. Configuration Reference

### `.paymongo` File Structure

This file is typically located in your project root.

```json
{
  "version": "1.0",
  "projectName": "My Awesome App",
  "environment": "test",
  "apiKeys": {
    "test": {
      "public": "pk_test_...",
      "secret": "sk_test_..."
    }
  },
  "webhooks": {
    "url": "http://localhost:3000/webhook",
    "events": ["payment.paid", "payment.failed"]
  },
  "dev": {
    "port": 3000,
    "autoRegisterWebhook": true,
    "verifyWebhookSignatures": true
  }
}
```

### Global Credentials

Credentials provided via `paymongo login` are stored at `~/.paymongo/credentials.enc`
using authenticated AES-GCM with a machine-derived key and persisted salt. Legacy
CBC records are migrated on successful load. This is not an OS keychain or a
complete compromise/recovery guarantee: protect the credential directory/salt,
project configuration, and explicit backups, which can also contain keys.

---

## 4. API Integration Details

The CLI interacts with the PayMongo V1 API.

**Base URL:** `https://api.paymongo.com/v1`

**Endpoints Used:**

- `GET /webhooks`: List all webhooks.
- `POST /webhooks`: Create a new webhook.
- `GET /webhooks/:id`: Retrieve a specific webhook.
- `PUT /webhooks/:id`: Update a webhook.
- `POST /webhooks/:id/disable`: Disable a webhook (not deletion).
- `POST /webhooks/:id/enable`: Re-enable a webhook.
- `GET /payments`: List recent payments.
- `GET /payments/:id`: Retrieve a specific payment.
- `POST /payment_intents`: Create a payment intent.
- `POST /payment_intents/:id/attach`: Attach a payment method.
- `POST /payment_intents/:id/capture`: Capture an authorized intent.
- `POST /payment_intents/:id/cancel`: Cancel an intent.
- `POST /payment_methods` and `GET /payment_methods/:id`: Create non-card methods/retrieve methods.
- `POST /checkout_sessions`: Create a Hosted Checkout Session (v1).
- `GET /checkout_sessions/:id`: Retrieve a Checkout Session.
- `POST /checkout_sessions/:id/expire`: Expire a Checkout Session (no request body).
- `POST /refunds`: Create a refund with amount, payment ID, and reason.
- `POST /payment_links`: Create a Payment Link (top-level fields).
- `GET /payment_links` and `GET /payment_links/:id`: List/retrieve flat Payment Links.

Webhook creation returns the signing secret as `data.attributes.secret_key`. The CLI stores it for verification and redacts it from webhook JSON output and bulk exports. Incoming webhook envelopes have `data.type = "event"`, the event name in `data.attributes.type`, and the affected resource in `data.attributes.data`. Verify the raw body against `te` for test events or `li` for live events.

See [API Alignment](PAYMONGO_API_ALIGNMENT.md) for official references and the remaining audit scope.

**Authentication:**
The CLI uses **Basic Authentication**.

- **Username**: Your Secret API Key.
- **Password**: (Empty).

---

## 5. Exit Codes

The CLI uses standard exit codes to indicate success or failure:

| Code | Meaning              | Description                               |
| :--- | :------------------- | :---------------------------------------- |
| `0`  | Success              | The command completed successfully.       |
| `1`  | General Error        | An unexpected error occurred.             |
| `2`  | Configuration Error  | Issues with `.paymongo` or missing setup. |
| `3`  | Authentication Error | Invalid API keys or unauthorized access.  |
| `4`  | Network Error        | Connection issues with PayMongo or ngrok. |
| `5`  | Validation Error     | Invalid command arguments or options.     |

---

## 6. Environment Variables

| Variable               | Description                                      |
| :--------------------- | :----------------------------------------------- |
| `PAYMONGO_SECRET_KEY`  | Overrides the secret key in `.paymongo`.         |
| `PAYMONGO_PUBLIC_KEY`  | Overrides the public key in `.paymongo`.         |
| `PAYMONGO_ENVIRONMENT` | Sets the active environment (`test` or `live`).  |
| `NGROK_AUTHTOKEN`      | Your ngrok authentication token.                 |
| `DEBUG`                | Enable verbose logging when set to `paymongo:*`. |

---

## 7. Rate Limiting Considerations

PayMongo API has rate limits. The CLI includes a built-in retry mechanism with exponential backoff to handle transient `429 Too Many Requests` errors. By default, it will retry up to 3 times.

# PayMongo CLI

> **A developer CLI for PayMongo local webhook testing, payment intent workflows, and integration debugging.**

PayMongo CLI is a **community-built, unofficial** terminal-first tool for developers integrating PayMongo. It is built to shorten the feedback loop around **local webhook testing**, **payment intent workflows**, and **integration debugging** without living in the dashboard.

[![npm version](https://img.shields.io/npm/v/paymongo-cli.svg)](https://www.npmjs.com/package/paymongo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Key Features

- **Local Webhook Listener and Forwarding**: Receive PayMongo webhooks through `ngrok`; optionally relay original bytes/signatures to your application with `dev --forward-to`, showing downstream status and timing.
- **Webhook Triggering and Replay**: Simulate and inspect PayMongo webhook events during development.
- **Payment Intent Workflows**: Create intents, attach payment methods, capture authorized payments, and create refunds from the terminal.
- **Payment Methods**: Create non-card methods and inspect existing tokenized methods.
- **Hosted Checkout Sessions**: Create one-time pages from line items, inspect sessions, and expire unused URLs (v1 API).
- **Payment Links (Hosted Checkout)**: Create hosted checkout links for easy customer payments.
- **One-time Payments**: Create sources for GCash, PayMaya, GrabPay, and other payment methods.
- **Webhook Signature Verification**: Built-in utility for verifying incoming webhook signatures.
- **Zero-Config Setup**: Get started in seconds with `paymongo init`.
- **Real-time Monitoring**: Watch webhook events as they happen with formatted terminal logs.
- **Privacy-First Analytics**: Optional local webhook event tracking to improve your development workflow (opt-in only).
- **Bulk Operations**: Import/export payments and webhooks for easy migration between environments.
- **Rate Limiting Protection**: Built-in API abuse prevention with configurable limits and automatic backoff.
- **Secure Management**: Local credential encryption for stored login sessions.

---

## 2.0 Beta

`2.0.0-beta.1` targets the **beta** channel. Once available in the registry,
install with `npm install -g paymongo-cli@beta`; stable installs remain on `latest`.
This community-built prerelease passes automated CI, but real PayMongo test-payment,
Checkout completion, and upstream ngrok webhook verification remain outstanding.
It is not full API or production certification. See [Release Checklist](RELEASE.md)
for migration notes, validation evidence, and remaining verification.

## Installation

### Prerequisites

- **Node.js**: 20.19+, 22.13+, or 24+ (Node 21/23 are unsupported). Prefer a maintained LTS.
- **ngrok account**: Required for webhook forwarding (free tier works great!)

### Install via npm (Recommended)

```bash
npm install -g paymongo-cli
```

### Setup ngrok Authtoken

To use the `dev` server with webhook forwarding, you need an ngrok authtoken:

1. Sign up at [ngrok.com](https://ngrok.com)
2. Copy your authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Configure it via environment variable or pass it at runtime:

```bash
export NGROK_AUTHTOKEN=YOUR_AUTHTOKEN
# or
paymongo dev --ngrok-token YOUR_AUTHTOKEN
```

---

## Quick Start

### 1. Initialize Project

```bash
mkdir my-paymongo-app
cd my-paymongo-app
paymongo init
```

### 2. Start Development Server

This command starts the CLI's webhook listener and exposes it through an ngrok tunnel. Choose a free port, separate from your application. It listens/logs by default; add `--forward-to` to deliver events to your application's endpoint.

```bash
paymongo dev --port 3000
```

### 3. Trigger a Test Webhook

In another terminal, simulate a successful payment:

```bash
paymongo trigger --event payment.paid --url http://localhost:3000/webhook
```

`trigger` sends a synthetic payload to the selected endpoint. It does not create a PayMongo payment, change payment status, or invoke PayMongo's webhook delivery service.

### 4. Attach a Payment Method to an Intent

Attach an existing Payment Method ID created by your application or `payment-methods create`. Redirect-based methods require a return URL:

```bash
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return
```

For local-only simulation in the **test** environment:

```bash
paymongo intents attach pi_123 --simulate --method gcash --delay 0
```

Simulation does not attach a method or change a payment in PayMongo. With `--json`, the output explicitly contains `simulated: true` and a synthetic `paymentIntent`.

### 5. Create a Payment Link (Hosted Checkout)

Create a hosted checkout link and share it with your customer:

```bash
paymongo payment-links create -a 5000 -d "Order #123 - Pizza"
```

### 6. Sources Compatibility Commands

Sources commands remain available but are still under documentation review. For new integrations, use the documented Payment Intent/Payment Method workflow above rather than treating Sources as the recommended e-wallet path:

```bash
paymongo sources create --amount 10000 --type gcash
```

---

## Application Webhook Forwarding

Keep your application running on its own port, then opt into forwarding from the
CLI listener:

```bash
# Application listens on port 3000; the CLI listener uses port 4000
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo

# Checkout payment notifications
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo --events checkout_session.payment.paid

# Optional timeout and background mode
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo --forward-timeout 5000 --detach
```

This is a **local CLI transport feature**, not a PayMongo API operation. Without
`--forward-to`, `dev` remains a listener/logger only.

- Sends the original request bytes, content type, and `Paymongo-Signature` header
  without re-serializing JSON or re-signing it. It does not copy authorization,
  cookies, or the incoming Host header.
- Configure your application with the **same upstream webhook signing secret**.
  Automatic registration can create a new secret each session; the CLI does not
  transfer that secret to your app. For an existing manually configured webhook,
  use `--no-register` and update its callback URL in the Dashboard as needed.
  Verify signatures in your application even if CLI verification is disabled.
- Reports application HTTP status and elapsed milliseconds, not payment success.
  A downstream 2xx gets a 200 acknowledgment from the CLI; a non-2xx/network
  failure gets 502, and a timeout gets 504. Application response bodies are discarded.
- Does not follow redirects or retry a delivery. Senders may redeliver after a
  failed acknowledgment; handle events idempotently using their event IDs.
- HTTP destinations are limited to loopback hosts; other destinations require
  HTTPS. Embedded credentials/fragments, direct listener/tunnel loops, and repeated
  CLI forwarding hops are rejected. The timeout defaults to 10000ms (range 1–30000).
- Incoming bodies are bounded to 1 MiB (413 when exceeded). Original UTF-8 bytes
  are collected before decoding so split multibyte characters do not break signatures.
- Shutdown aborts pending forwarding and releases sockets; startup failures clean
  up local resources. Status/state record only forwarding enablement/timeout, not
  the destination URL. Destination queries, signatures, and response bodies are not logged.

Existing opt-in analytics describe webhook receipt/verification, not application
delivery success. Terminal delivery results are separate. This development relay
is not a production queue, exactly-once service, or replacement for payment verification.

## Payment Intents

Payment intents track a payment through creation, attachment, customer action, and completion. Amounts must be integers of at least `100` centavos; the documented intent endpoint supports **PHP only**. Payment methods also have provider-specific limits and require account activation.

```bash
# Create an intent for a documented method
paymongo intents create --amount 10000 --methods gcash --description "Order #123"

# Attach a Payment Method created by your application or payment-methods create
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return

# Inspect the current state and any customer redirect instructions
paymongo intents show pi_123
```

Attachment can return `awaiting_next_action` or `processing`; it does not always mean payment success. Confirm the final result with a verified webhook or retrieve the intent.

### Manual Card Authorization and Capture

```bash
paymongo intents create --amount 50000 --methods card --capture-type manual --three-d-secure any
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return

# After customer authentication, the intent must be awaiting_capture
paymongo intents capture pi_123                  # Full capture
# OR
paymongo intents capture pi_123 --amount 25000   # Partial capture
# OR cancel the uncaptured authorization
paymongo intents cancel pi_123
```

These IDs are examples; replace them with returned resource IDs. Full capture, partial capture, and cancellation are alternative actions, not a sequence to run on the same hold. Per PayMongo's [Hold then capture guide](https://docs.paymongo.com/docs/payment-acceptance-hold-then-capture), account activation is required, eligible card/merchant restrictions apply, and holds expire after 7 days.

Creation options: `--methods`, `--capture-type automatic|manual`, and `--three-d-secure any|automatic`. The older `payments create-intent`, `payments attach`/`confirm`, and `payments capture` commands remain available with the same flags.

## Payment Methods

Create non-card Payment Methods through the real PayMongo API, then attach the returned
`pm_...` ID to an intent. These are not synthetic simulation commands:

```bash
paymongo intents create --amount 10000 --methods gcash
paymongo payment-methods create --type gcash
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return

paymongo payment-methods create --type dob --bank-code bpi
paymongo payment-methods create --type qrph --expiry-seconds 600
paymongo payment-methods show pm_456 --json
```

Replace example IDs with the resources returned by PayMongo. Choose your test/live
environment deliberately; account activation and channel-specific rules still apply.

- Non-card types: `qrph`, `brankas`, `dob`, `billease`, `gcash`, `grab_pay`, `shopee_pay`, `paymaya`.
- DOB banks: `bpi`, `ubp`; the documented test codes are `test_bank_one` and `test_bank_two`.
  Brankas banks: `bdo`, `metrobank`, `landbank`.
- `--expiry-seconds` applies after attachment: QR Ph `60–9000`; ShopeePay `1–3600`.
- Optional `--billing-file` and `--metadata-file` read JSON objects, not command-line PII.
  Billing addresses use `country`; metadata values must be strings.
- Raw card creation is deliberately not exposed. Tokenize cards in your application
  or use Hosted Checkout. Existing tokenized card methods can be retrieved and attached.

## Hosted Checkout Sessions (v1)

Create a one-time hosted checkout page from line items, distinct from Payment Links:

```bash
paymongo checkout create --name "Order #123" --amount 50000 --methods card,gcash
paymongo checkout show cs_123 --json
paymongo checkout expire cs_123 --yes
```

For multiple items, save a JSON array as `items.json`:

```json
[
  { "amount": 10000, "currency": "PHP", "name": "Coffee", "quantity": 2 },
  { "amount": 15000, "currency": "PHP", "name": "Tea", "quantity": 1 }
]
```

```bash
paymongo checkout create --items-file items.json --methods card,gcash \
  --reference-number order-123 \
  --success-url https://example.com/success \
  --cancel-url https://example.com/cart
```

Use `--items-file` **or** single-item flags, not both. Amount is the unit price in
centavos; the CLI requires positive integers and PHP. Quantity is `1–1000000000`;
there may be at most 999 items. PayMongo enforces provider-specific amount limits
and merchant eligibility. `--no-show-description`, `--no-show-line-items`, and
`--send-email-receipt` control the documented display/receipt attributes.

The CLI explicitly uses the documented **v1** create/retrieve/expire endpoints.
PayMongo's newer quick-start uses v2; v2 support is not claimed here. A session's
`active`/`expired` status describes availability, not payment success.
A success redirect is not proof of payment; a cancel redirect does not cancel
the session. Expiration disables the checkout URL and is **not a refund**.
Subscribe to `checkout_session.payment.paid` and fulfill only after verifying the
PayMongo webhook signature and matching the session/order reference.

Both new command groups provide sanitized `--json` resource output: billing PII,
client keys, raw card number/CVC fields, and known secret/API-key fields are removed
recursively. JSON input files are limited to 1 MiB; protect billing files and do not
commit them. Creation and expiration requests are not automatically replayed after
network failure; reconcile uncertain outcomes in the Dashboard before retrying.

## Payment Links (Hosted Checkout)

Payment links provide a shareable payment page. The CLI uses the current `/v1/payment_links` API, not legacy `/v1/links`. Amounts must be integers from `100` to `999999999` centavos. A link's `active`/`archived` status describes whether it accepts payments, not whether a customer has paid.

The API uses top-level request fields and flat response objects, including `url` and ISO 8601 timestamps. `--json` returns that flat resource. `payment-links list --limit` limits local output only; it is not an API pagination parameter.

Examples:

```bash
# Create a payment link
paymongo payment-links create -a 5000 -d "Order #123"

# List all payment links
paymongo payment-links list

# Show payment link details
paymongo payment-links show pl_abc123
```

## Refunds

PayMongo requires an explicit refund amount and reason. There is no implicit full-refund request. Use the payment's refundable amount for a full refund, or a smaller amount for a partial refund (minimum `100` centavos).

```bash
paymongo payments refund pay_123 --amount 5000 --reason requested_by_customer
```

Supported reasons: `duplicate`, `fraudulent`, `requested_by_customer`, `others`.

## One-time Payments (Sources)

Sources allow one-time payments without creating a customer:

```bash
# Create a GCash source
paymongo sources create --amount 5000 --type gcash

# Create a PayMaya source
paymongo sources create --amount 5000 --type paymaya

# Check payment status
paymongo sources show src_abc123
```

These legacy channel options have not yet been audited against the current API. For new integrations, use Payment Intent/Payment Method workflows or Hosted Checkout rather than assuming all legacy options are supported.

---

## Webhook Signature Verification

PayMongo CLI includes a utility for verifying incoming webhook signatures. Use the original raw body (not re-serialized JSON), the endpoint's signing secret, and the event's mode. Test events use `te`; live events use `li`:

```typescript
import { verifyWebhookSignature } from 'paymongo-cli/dist/utils/webhook-verifier.js';

const isValid = verifyWebhookSignature({
  payload: rawBody, // Original request body decoded as UTF-8, not JSON.stringify(parsedBody)
  signatureHeader: request.headers['paymongo-signature'],
  secret: 'whsk_xxx', // attributes.secret_key from the Webhook resource
  livemode: false, // use true for live-mode events
});
```

---

## Rate Limiting Protection

PayMongo CLI includes built-in rate limiting to prevent accidental API abuse and protect your test credits. Rate limits are automatically enforced with:

- **CLI-Configured Limits**: 100 requests/minute in test environment, 50 in live (local safeguards, not PayMongo's published server quotas)
- **Endpoint-Specific Limits**: Stricter limits for expensive operations like webhook creation
- **Automatic Backoff**: Retryable requests use exponential backoff; API validation/authentication failures are not retried. Payment Method creation and Checkout creation/expiration are not automatically replayed.
- **Configurable Settings**: Customize limits via `paymongo config rate-limit`

### Managing Rate Limits

```bash
# Enable rate limiting
paymongo config rate-limit enable

# Set maximum requests per minute
paymongo config rate-limit set-max-requests 200

# Set time window in seconds
paymongo config rate-limit set-window 120

# Check current status
paymongo config rate-limit status

# Disable rate limiting (not recommended)
paymongo config rate-limit disable
```

### Global Override

Use `--no-rate-limit` with any command to temporarily disable rate limiting:

```bash
paymongo payments list --no-rate-limit
```

## Analytics (Optional)

PayMongo CLI can optionally track webhook events to provide insights into your development workflow. All analytics data is stored locally and never transmitted to external servers.

### Privacy-First Design

- **Opt-in Only**: Analytics is disabled by default and must be explicitly enabled
- **Local Storage**: All data remains on your machine
- **No External Transmission**: Data is never sent to PayMongo or third parties
- **Full Control**: Disable anytime and clear all stored data

### Enabling Analytics

```bash
# Enable webhook event tracking
paymongo config analytics enable

# View current analytics status
paymongo config analytics status

# Disable analytics (default)
paymongo config analytics disable
```

### Analytics Features

When enabled, the CLI tracks:

- **Webhook Events**: Successful and failed webhook deliveries
- **Event Types**: Payment events, source events, and more
- **Response Times**: Processing performance metrics
- **Error Analysis**: Failed webhook reasons and patterns

Analytics data helps you:

- Monitor webhook reliability during development
- Identify integration issues early
- Optimize your webhook handling code
- Track testing patterns and event frequencies

---

## Commands Reference

| Command                      | Description                                             |
| :--------------------------- | :------------------------------------------------------ |
| `paymongo init`              | Initialize a new project and set up credentials.        |
| `paymongo dev`               | Receive/inspect webhooks; optionally forward to your application. |
| `paymongo payments`          | Manage payments (list, show, export, import).           |
| `paymongo intents`           | Create, inspect, attach, capture, and cancel payment intents. |
| `paymongo payment-methods`   | Create non-card methods and retrieve existing Payment Methods. |
| `paymongo checkout`          | Create, retrieve, and expire Hosted Checkout Sessions (v1 API). |
| `paymongo sources`           | Create one-time payment sources (GCash, PayMaya, etc). |
| `paymongo payment-links`     | Create hosted checkout payment links.                   |
| `paymongo webhooks`          | List, create, and manage PayMongo webhooks.             |
| `paymongo trigger`           | Simulate webhook events locally for testing.            |
| `paymongo doctor`            | Run integration diagnostics.                             |
| `paymongo config`            | View and modify CLI configuration.                      |
| `paymongo team`              | Share API keys with team members.                       |
| `paymongo env`               | Switch between test/live environments.                 |

> Use `paymongo <command> --help` for detailed information on any command.

---

## Documentation

- **[Installation Guide](INSTALLATION.md)** - Platform-specific setup instructions.
- **[User Guide](USER_GUIDE.md)** - Detailed step-by-step instructions.
- **[API Reference](API_REFERENCE.md)** - Command and option reference.
- **[API Alignment](PAYMONGO_API_ALIGNMENT.md)** - Verified PayMongo contracts and remaining review scope.
- **[Troubleshooting](TROUBLESHOOTING.md)** - Solutions to common issues.
- **[Contributing](CONTRIBUTING.md)** - Help improve the PayMongo CLI.

---

## Use Case

PayMongo CLI is intended for developers working on PayMongo-powered applications in local, QA, and staging environments. It is most useful when you need to:

- receive PayMongo webhooks on localhost
- validate webhook signature handling
- test payment intent attachment and capture flows
- inspect payments and refunds without leaving the terminal
- debug PayMongo integrations faster than a dashboard-only workflow

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

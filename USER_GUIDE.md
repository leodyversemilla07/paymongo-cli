# PayMongo CLI User Guide

Welcome to the comprehensive guide for the **PayMongo CLI**. This tool is designed to provide Filipino developers with a premium development experience when integrating PayMongo payments.

---

## 📋 Table of Contents

1.  [Introduction and Overview](#1-introduction-and-overview)
2.  [Prerequisites and Setup](#2-prerequisites-and-setup)
3.  [Getting Started](#3-getting-started)
4.  [Core Workflows](#4-core-workflows)
5.  [Command Reference](#5-command-reference)
6.  [Advanced Features](#6-advanced-features)
7.  [Troubleshooting](#7-troubleshooting)
8.  [Best Practices](#8-best-practices)

---

## 1. Introduction and Overview

PayMongo CLI is a powerful command-line interface that streamlines the PayMongo integration process. Whether you are building an e-commerce platform with GCash, a subscription service with Maya, or a simple donation page, this CLI helps you:

- **Test Webhooks Locally**: No more deploying to staging just to test a webhook.
- **Manage Payments**: Create and monitor payment intents directly from your terminal.
- **Collaborate**: Share API key bundles with your team locally.

---

## 2. Prerequisites and Setup

### System Requirements

- **Node.js**: 20.19+, 22.13+, or 24+ (Node 21/23 are unsupported). Prefer a maintained LTS.
- **npm**: v9.0.0 or higher
- **Internet Connection**: Required for API calls and ngrok tunneling.

### Installation

Install the CLI globally using npm:

```bash
npm install -g paymongo-cli
```

### ngrok Setup (Critical for Webhooks)

The CLI uses **ngrok** to create a secure tunnel from the internet to your local machine. This allows PayMongo's servers to send webhook events to your localhost.

1.  Sign up for a free account at [ngrok.com](https://ngrok.com).
2.  Get your **Authtoken** from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
3.  Configure the token via environment variable or a per-run flag:

```bash
# Method 1: Environment Variable
export NGROK_AUTHTOKEN=YOUR_AUTHTOKEN

# Method 2: Per-run flag
paymongo dev --ngrok-token YOUR_AUTHTOKEN
```

---

## 3. Getting Started

Follow these steps to set up your first PayMongo project locally.

### Step 1: Initialize Your Project

Navigate to your project directory and run:

```bash
paymongo init
```

The CLI will ask you several questions:

- **Project Name**: A friendly name for your project.
- **Environment**: Choose `test` (recommended) or `live`.
- **Secret API Key**: Your PayMongo secret key (starts with `sk_test_` or `sk_live_`).
- **Public API Key**: Your PayMongo public key (starts with `pk_test_` or `pk_live_`).
- **Development Port**: A free port for the CLI's webhook listener (default: `3000`); do not reuse your application's port.

### Step 2: Verify Configuration

Check your generated configuration:

```bash
paymongo config show
```

This will create two files in your directory:

- `.paymongo`: Internal configuration (contains API keys and settings).
- `.env`: Standard environment variables for your application.

> **Tip**: Both files are automatically added to your `.gitignore` by `paymongo init`.

---

## 4. Core Workflows

### Local Webhook Development

The CLI handles tunneling, webhook registration, and event inspection. It receives/logs by default; opt into application forwarding with `--forward-to`.

1.  **Choose a free port** for the CLI listener (e.g., 3000).
2.  **Start the PayMongo dev server**:

```bash
paymongo dev --port 3000
```

This command will:

- Create an ngrok tunnel (e.g., `https://random-id.ngrok-free.app`).
- Register a temporary webhook on PayMongo pointing to that tunnel.
- Receive and inspect events at the CLI listener's `/webhook` or `/webhook/<project-slug>` endpoint.
- Verify signatures when enabled and acknowledge events with HTTP 200 and JSON.
- Disable the temporary remote webhook on normal shutdown.

To receive real test-mode events in your application, leave the application on its
own port and use a separate CLI listener port:

```bash
paymongo dev --port 4000 --forward-to http://127.0.0.1:3000/api/webhooks/paymongo
```

For Checkout, add `--events checkout_session.payment.paid`. Forwarding preserves
the original body/signature and reports the app's HTTP status/timing. Configure
your app with the same upstream webhook signing secret; the CLI does not re-sign
or transfer secrets. Automatic registration can create a new secret each session.
For an existing manually configured webhook/secret, use `--no-register` and update
its callback URL as needed.

Downstream 2xx is acknowledged with 200; application/network failure returns 502,
and timeout returns 504. The deadline defaults to 10000ms; set `--forward-timeout`
to an integer from 1 to 30000. No redirects or automatic delivery retries are
performed. Handle provider redelivery idempotently; app acceptance is not payment
verification. Incoming bodies are limited to 1 MiB; loops are rejected.
HTTP targets must be loopback; use HTTPS elsewhere. Receipt analytics and app
delivery results are separate, and app response bodies/forwarding URL queries
are not logged. Background mode preserves forwarding options.

To send a synthetic event directly to your application's handler, target it explicitly:

```bash
paymongo trigger --event payment.paid --url http://localhost:4000/api/webhooks/paymongo
```

This sends a synthetic payload. For real test-mode delivery, register a publicly reachable endpoint with PayMongo and follow its documented payment testing flow.

### Testing a Successful Payment

You can simulate webhook events without making actual API calls or going through a browser:

```bash
paymongo trigger --event payment.paid
```

This will send a mock `payment.paid` payload to your local webhook endpoint.

---

## 5. Command Reference

### Core Commands

#### `paymongo init`

**Purpose**: Initialize a new PayMongo project with configuration.

**Authentication**: No API authentication required (sets up credentials).

**Parameters**:

| Option                    | Description                            |
| :------------------------ | :------------------------------------- |
| `-n, --name <name>`       | Project name                           |
| `-e, --env <environment>` | Environment (test/live), default: test |
| `-k, --key <key>`         | Secret API key                         |
| `--public-key <key>`      | Public API key                         |
| `-u, --url <url>`         | Webhook URL                            |
| `-p, --port <port>`       | Development port, default: 3000        |
| `--events <events>`       | Comma-separated webhook events         |
| `--non-interactive`       | Skip interactive prompts               |

#### `paymongo login`

**Purpose**: Manage API credentials securely.

**Authentication**: No (manages authentication).

**Usage**:

```bash
# Interactive login
paymongo login

# Non-interactive login
paymongo login --key sk_test_xxx --env test

# Logout
paymongo login --logout
```

The secret key (and public key, if supplied) must match the selected `test` or
`live` environment. `--key` chooses non-interactive input; it does not bypass API
validation. Prefer the interactive password prompt to avoid secrets in shell
history/process arguments. Failed encryption-salt initialization aborts login
rather than saving credentials that cannot be recovered on the next run.

---

### Development Commands

#### `paymongo dev`

**Purpose**: Start local development server with ngrok tunnel and webhook handling.

**Authentication**: Required (uses API keys for webhook registration).

**Parameters**:

| Option                  | Description                            |
| :---------------------- | :------------------------------------- |
| `-p, --port <port>`     | Port for webhook server, default: 3000 |
| `--no-register`         | Skip automatic webhook registration    |
| `--forward-to <url>`    | Opt-in relay to loopback HTTP or HTTPS application endpoint |
| `--forward-timeout <ms>` | Application deadline, default 10000ms (1–30000) |
| `-d, --detach`          | Background mode, preserving forwarding options |
| `-e, --events <events>` | Events to listen for                   |

**Features**:

- Automatic ngrok tunnel creation
- Webhook registration with PayMongo
- Signature verification
- Real-time event logging
- Optional raw-body/signature forwarding with downstream status/timing
- No forwarding redirects/retries; bounded payloads and shutdown

#### `paymongo trigger`

**Purpose**: Simulate webhook events locally for testing.

**Authentication**: No (generates mock events).

`trigger send` records the original synthetic attempt as delivered only after an
HTTP 2xx acknowledgment; non-2xx/network failures are recorded as failed. This is
transport status, not proof of payment. `trigger replay` preserves the stored
payload and original record; older CLI histories may have inaccurate delivery
labels. Malformed history records are ignored. New history files/directories
request owner-only permissions; audit existing permissions and OS ACLs separately.

**Parameters**:

| Option                | Description                    |
| :-------------------- | :----------------------------- |
| `-e, --event <event>` | Specific event type to trigger |
| `-u, --url <url>`     | Webhook URL to send to         |
| `-j, --json`          | Output event data as JSON      |

**Supported Events**:

- `payment.paid`
- `payment.failed`
- `payment.refunded`
- `source.chargeable`
- `checkout_session.payment.paid`
- `link.payment.paid`
- `qrph.expired`

---

### Configuration Commands

#### `paymongo config`

**Purpose**: View and modify CLI configuration.

**Authentication**: No.

**Subcommands**:

##### `config show`

Display current configuration.

```bash
paymongo config show
paymongo config show --json  # Diagnostic JSON with credentials redacted
```

API keys in both environments and webhook signing secrets are replaced with
`[REDACTED]`. Do not use this output as a credential backup. Explicit `config backup`
files retain their existing contents and must be protected.

##### `config set <key> <value>`

Set a configuration value.

```bash
paymongo config set dev.port 4000
paymongo config set environment live
export NGROK_AUTHTOKEN=YOUR_TOKEN
```

##### `config reset`

Reset configuration to defaults.

```bash
paymongo config reset
```

##### `config backup`

Create a timestamped backup of current configuration.

| Option                  | Description            |
| :---------------------- | :--------------------- |
| `-d, --directory <dir>` | Backup directory       |
| `-n, --name <name>`     | Custom filename prefix |

##### `config import <file>`

Import configuration from a JSON file.

| Option        | Description               |
| :------------ | :------------------------ |
| `-f, --force` | Overwrite existing config |

---

### Webhook Management

#### `paymongo webhooks`

**Purpose**: Manage PayMongo webhooks.

**Authentication**: Required (API operations).

**Subcommands**:

##### `webhooks list`

List all webhooks.

| Option                  | Description                         |
| :---------------------- | :---------------------------------- |
| `-j, --json`            | JSON output                         |
| `-s, --status <status>` | Filter by status (enabled/disabled) |

##### `webhooks create`

Create a new webhook interactively or with options.

| Option                  | Description            |
| :---------------------- | :--------------------- |
| `-u, --url <url>`       | Webhook URL            |
| `-e, --events <events>` | Comma-separated events |

##### `webhooks show <id>`

Show detailed webhook information.

##### `webhooks disable <id>`

Disable a webhook (with confirmation).

| Option      | Description       |
| :---------- | :---------------- |
| `-y, --yes` | Skip confirmation |

##### `webhooks enable <id>`

Re-enable a disabled webhook.

---

### Payment Management

#### `paymongo payments`

**Purpose**: Manage PayMongo payments and payment intents.

**Authentication**: Required (API operations).

**Subcommands**:

##### `payments list`

List recent payments (default limit: 10).

| Option                 | Description                |
| :--------------------- | :------------------------- |
| `-l, --limit <number>` | Number of payments to show |
| `-j, --json`           | JSON output                |

##### `payments show <id>`

Show detailed payment information.

| Option       | Description |
| :----------- | :---------- |
| `-j, --json` | JSON output |

##### `payments create-intent`

Create a new payment intent.

| Option                            | Description                                  |
| :-------------------------------- | :------------------------------------------- |
| `-a, --amount <amount>`           | Integer centavos, minimum 100 (default: 10000) |
| `-c, --currency <currency>`       | PHP only                                     |
| `-d, --description <description>` | Payment description                          |
| `-m, --methods <methods>`         | Comma-separated API method types               |
| `--capture-type <type>`           | automatic or manual; manual requires card-only methods |
| `--three-d-secure <mode>`         | any or automatic, for cards                   |
| `-j, --json`                      | JSON output                                  |

`paymongo intents create` is the canonical command and exposes the same flags.

##### `payments attach <intentId>`

Attach a payment method to a payment intent using PayMongo's current attach flow.

| Option                    | Description                                           |
| :------------------------ | :---------------------------------------------------- |
| `-p, --payment-method`    | Payment method ID to attach                           |
| `-r, --return-url <url>`  | Return URL for redirect-based payment methods         |
| `-s, --simulate`          | Local-only simulation in the test environment; never changes PayMongo |
| `-d, --delay <ms>`        | Non-negative integer delay for simulation (0 allowed) |

`paymongo intents attach` provides the same workflow. If attachment returns `awaiting_next_action`, complete the customer redirect displayed by the CLI. If it returns `awaiting_capture`, the card is authorized but not charged. Do not fulfill an order based on an attachment request alone.

##### Manual capture

```bash
paymongo intents create --amount 50000 --methods card --capture-type manual
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return
paymongo intents show pi_123
paymongo intents capture pi_123 --amount 25000
```

Use actual resource IDs from your integration. After authentication, capture is available only for an eligible authorized intent. Omit `--amount` for full capture; provide a positive integer in centavos for partial capture. `paymongo intents cancel <id>` cancels an uncaptured hold. PayMongo account activation and eligible cards are required; holds expire after 7 days.

With simulation, `--json` outputs an explicit `simulated: true` envelope. This synthetic result is not evidence that a real intent has been paid.

---

### Payment Methods and Hosted Checkout

Use the selected test environment while developing. These commands call PayMongo's
API; unlike local simulation, they create actual test/live resources.

```bash
paymongo payment-methods create --type gcash
paymongo intents attach pi_123 --payment-method pm_456 --return-url https://example.com/return
paymongo payment-methods create --type dob --bank-code bpi
paymongo payment-methods create --type qrph --expiry-seconds 600
paymongo payment-methods show pm_456 --json
```

Replace the example IDs with IDs returned by PayMongo. Method creation does not
initiate payment until attachment to an intent. For cards, tokenize in your
application or use Hosted Checkout; the CLI does not accept raw card details.
Optional billing/metadata attributes come from JSON files using `--billing-file`
and `--metadata-file`. Use string metadata values and `address.country`, not
`country_code`. Protect local billing files; do not commit them.

Hosted Checkout handles customer input and payment authentication on PayMongo's page:

```bash
paymongo checkout create --name "Order #123" --amount 50000 --methods card,gcash
paymongo checkout create --items-file items.json --reference-number order-123
paymongo checkout show cs_123
paymongo checkout expire cs_123 --yes
```

`items.json` is an array of objects with `amount` (positive integer unit price in
centavos), `currency: "PHP"`, `name`, and `quantity`. Single-item creation defaults
quantity to 1; do not combine its flags with `--items-file`. Optional display/
receipt flags include `--no-show-description`, `--no-show-line-items`, and
`--send-email-receipt`. PayMongo still checks enabled channels and amount limits.

The commands deliberately use documented **v1** Checkout endpoints, not the v2
quick-start. Session `active` does not mean paid, and a success redirect is not proof
of payment. A cancel redirect does not cancel the session; expiration disables the
URL and does not refund payments. Subscribe to `checkout_session.payment.paid`,
verify the signature, and match the session/order reference before fulfillment.

For both groups, `--json` is sanitized: billing PII, client keys, raw card/CVC fields,
and known secret/API-key fields are removed recursively. JSON files must be at most
1 MiB. Mutating requests are not automatically replayed after network failure;
reconcile uncertain outcomes in the Dashboard before retrying.
See [API Reference](API_REFERENCE.md#paymongo-checkout) for all flags and limits.

### Diagnostics

#### `paymongo doctor`

Run setup diagnostics for your local PayMongo integration.

This command checks:

- whether `.paymongo` exists and loads
- whether the current environment keys are present and well-formed
- whether PayMongo API validation succeeds
- whether `NGROK_AUTHTOKEN` is configured for `paymongo dev`
- whether webhook signature verification is safely configured

Use offline mode if you only want local checks:

```bash
paymongo doctor --no-network
```

---

---

### Team Collaboration

#### `paymongo team`

**Purpose**: Team collaboration via shareable API key bundles.

**Authentication**: No GitHub auth required; uses your local PayMongo config.

**Subcommands**:

##### `team share-keys`

Generate a shareable API key bundle for one or more environments.

| Option              | Description                            |
| :------------------ | :------------------------------------- |
| `-e, --env <envs>`  | Environments to share (`test,live`)    |
| `-c, --copy`        | Copy the bundle to clipboard if possible |

##### `team import-keys`

Import a shared API key bundle from another teammate.

| Option              | Description                        |
| :------------------ | :--------------------------------- |
| `-f, --force`       | Overwrite existing keys if needed  |

##### `team list-members`

List locally tracked team members and shared key history.

##### `team rename <name>`

Rename the local team.

##### `team remove-member <memberName>`

Remove a tracked team member.

---

### Authentication Requirements Summary

| Command    | Requires API Auth     | Notes                             |
| :--------- | :-------------------- | :-------------------------------- |
| `init`     | No                    | Sets up authentication            |
| `login`    | No                    | Manages authentication            |
| `dev`      | Yes                   | Registers webhooks via API        |
| `trigger`  | No                    | Local event simulation            |
| `config`   | No                    | Local configuration only          |
| `webhooks` | Yes                   | All webhook operations            |
| `payments` | Yes                   | All payment operations            |
| `team`     | No                    | Shares/imports API key bundles locally |

### Command Dependencies

- **Config-dependent**: All commands except `init` require `.paymongo` config file
- **API-dependent**: Commands marked as requiring auth need valid PayMongo API keys
- **Network-dependent**: `dev`, `webhooks` require internet for API calls
- **Interactive**: Most commands support both interactive and non-interactive modes

---

## 6. Advanced Features

### Webhook Signature Verification

For security, PayMongo signs webhook events. The CLI supports verifying these signatures locally to ensure the events originated from PayMongo.

1.  **Enable Verification**:
    ```bash
    paymongo config set dev.verifyWebhookSignatures true
    ```
2.  **How it works**:
    - When `paymongo dev` registers a webhook, it receives a `secret`.
    - The CLI stores this secret in `.paymongo` under `webhookSecrets`.
    - For every incoming request, the CLI validates the `paymongo-signature` header using `HMAC SHA256`.
    - If the signature is invalid, the CLI logs a warning and returns a `401 Unauthorized` status.
3.  **Manual testing note**:
    - New configs enable signature verification by default.
    - If you are sending unsigned local test requests manually, temporarily disable verification:
      ```bash
      paymongo config set dev.verifySignatures false
      ```
    - Re-enable it once your webhook secret is available:
      ```bash
      paymongo config set dev.verifySignatures true
      ```

### File Structure and Configuration

The CLI manages configuration at both the project and system levels:

- **Project Level (`.paymongo`)**: Stores project-specific settings like the development port, active webhook IDs, and webhook secrets.
- **Environment (`.env`)**: Standard environment variables (`PAYMONGO_SECRET_KEY`, etc.) for your application to use.
- **System Level (`~/.paymongo/credentials.enc`)**: Stores your global API keys securely using AES-256-GCM encryption. This allows you to switch projects without re-authenticating.

### Team Collaboration

Share API keys with your team using generated bundles.

1.  **Generate a bundle**:
    ```bash
    paymongo team share-keys --env test
    ```
2.  **Import it on a teammate machine**:
    ```bash
    paymongo team import-keys
    ```

This keeps sharing explicit and avoids requiring GitHub-based sync for secrets.

---

## 7. Troubleshooting

| Issue                     | Solution                                                                                                         |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| **ngrok authtoken error** | Set `NGROK_AUTHTOKEN` or run `paymongo dev --ngrok-token YOUR_TOKEN`.                                           |
| **Connection Refused**    | Ensure your local app is running on the specified port (default: 3000).                                          |
| **Invalid API Key**       | Run `paymongo login` to update your credentials globally.                                                        |
| **Webhook not received**  | Check if the tunnel URL is active in the `paymongo dev` logs and registered in your PayMongo dashboard.          |
| **Signature Fail**        | If you are sending unsigned local test requests, run `paymongo config set dev.verifySignatures false`, then re-enable it once secrets are configured. |

---

## 8. Best Practices

- **Use Test Keys**: Always develop using `sk_test_` keys. Switch to `sk_live_` only for final production verification.
- **Security**: Never commit your `.paymongo` or `.env` files. The CLI adds them to `.gitignore` by default—don't remove them!
- **Specific Events**: Only listen for the webhook events your application actually handles to reduce noise.
- **Port Consistency**: Stick to a consistent port (like 3000) for your local development to avoid frequent re-configurations.

---

## Built for the Philippine Fintech Ecosystem

The PayMongo CLI is optimized for the specific needs of Filipino developers. We support all local payment methods including GCash, Maya, GrabPay, and QRPh.

For more information, visit the [official PayMongo documentation](https://developers.paymongo.com).

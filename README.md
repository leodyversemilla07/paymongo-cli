# PayMongo CLI

> **A developer CLI for PayMongo local webhook testing, payment intent workflows, and integration debugging.**

PayMongo CLI is a terminal-first tool for developers integrating PayMongo. It is built to shorten the feedback loop around **local webhook testing**, **payment intent workflows**, and **integration debugging** without living in the dashboard.

[![npm version](https://img.shields.io/npm/v/paymongo-cli.svg)](https://www.npmjs.com/package/paymongo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Key Features

- **Local Webhook Forwarding**: Seamlessly receive PayMongo webhooks on your localhost using integrated `ngrok` tunneling.
- **Webhook Triggering and Replay**: Simulate and inspect PayMongo webhook events during development.
- **Payment Intent Workflows**: Create intents, attach payment methods, capture authorized payments, and create refunds from the terminal.
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

## Installation

### Prerequisites

- **Node.js**: v20.0.0 or higher
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

This command sets up a tunnel and starts forwarding webhooks to your local app.

```bash
paymongo dev --port 3000
```

### 3. Trigger a Test Webhook

In another terminal, simulate a successful payment:

```bash
paymongo trigger --event payment.paid
```

### 4. Attach a Payment Method to an Intent

Attach a real payment method, or use the built-in simulation flow during development:

```bash
paymongo payments attach pi_123 --simulate --method gcash
```

### 5. Create a Payment Link (Hosted Checkout)

Create a hosted checkout link and share it with your customer:

```bash
paymongo payment-links create -a 5000 -d "Order #123 - Pizza"
```

### 6. Create a One-time Source (GCash/PayMaya)

Generate a source for alternative payment methods:

```bash
paymongo sources create --amount 10000 --type gcash
```

---

## Payment Intents

Payment intents are the recommended way to accept payments. Create, manage, and track payment flows:

```bash
# Create a payment intent
paymongo intents create --amount 10000 --description "Premium Subscription"

# Show payment intent details
paymongo intents show pi_abc123

# Cancel an intent (before payment)
paymongo intents cancel pi_abc123
```

## Payment Links (Hosted Checkout)

Payment links provide a hosted checkout page for seamless payment collection:

```bash
# Create a payment link
paymongo payment-links create -a 5000 -d "Order #123"

# List all payment links
paymongo payment-links list

# Show payment link details
paymongo payment-links show pl_abc123
```

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

Supported payment types: `gcash`, `paymaya`, `grabpay`, `card`, `bancomer`

---

## Webhook Signature Verification

PayMongo CLI includes a utility for verifying incoming webhook signatures:

```typescript
import { verifyWebhookSignature } from 'paymongo-cli/utils/webhook-verifier';

const isValid = verifyWebhookSignature({
  payload: JSON.stringify(requestBody),
  signatureHeader: request.headers['paymongo-signature'],
  secret: 'whsec_xxx',
});
```

---

## Rate Limiting Protection

PayMongo CLI includes built-in rate limiting to prevent accidental API abuse and protect your test credits. Rate limits are automatically enforced with:

- **Default Limits**: 100 requests/minute in test environment, 50 in live
- **Endpoint-Specific Limits**: Stricter limits for expensive operations like webhook creation
- **Automatic Backoff**: Failed requests are automatically retried with exponential backoff
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
| `paymongo dev`               | Start local development server with webhook forwarding. |
| `paymongo payments`          | Manage payments (list, show, export, import).           |
| `paymongo intents`           | Manage payment intents (create, show, cancel).         |
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
- **[API Reference](API_REFERENCE.md)** - Complete command and option reference.
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

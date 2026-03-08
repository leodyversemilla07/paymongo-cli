# PayMongo CLI

> **A developer-first CLI for PayMongo integration with local webhook forwarding.**

PayMongo CLI is the official-feel command-line tool designed to streamline your development process with PayMongo. It solves the biggest pain point in payment integration: **testing webhooks locally**.

[![npm version](https://img.shields.io/npm/v/paymongo-cli.svg)](https://www.npmjs.com/package/paymongo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Key Features

- **Local Webhook Forwarding**: Seamlessly receive PayMongo webhooks on your localhost using integrated `ngrok` tunneling.
- **Zero-Config Setup**: Get started in seconds with `paymongo init`.
- **Payment Testing**: Create and monitor payment intents and payments directly from your terminal.
- **Real-time Monitoring**: Watch webhook events as they happen with formatted terminal logs.
- **Privacy-First Analytics**: Optional local webhook event tracking to improve your development workflow (opt-in only).
- **Team Collaboration**: Share API key bundles with teammates for test/live environments.
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

````bash
paymongo payments list --no-rate-limit
---

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
````

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
| `paymongo payments`          | Manage payments and payment intents.                    |
| `paymongo webhooks`          | List, create, and manage PayMongo webhooks with filtering by status and event type.             |
| `paymongo config`            | View and modify CLI configuration.                      |
| `paymongo config analytics`  | Configure webhook analytics settings.                   |
| `paymongo config rate-limit` | Configure rate limiting settings.                       |
| `paymongo team`              | Share API key bundles with your team.                   |
| `paymongo trigger`           | Simulate webhook events locally for testing.            |

> Use `paymongo <command> --help` for detailed information on any command.

---

## Documentation

- **[Installation Guide](INSTALLATION.md)** - Platform-specific setup instructions.
- **[User Guide](USER_GUIDE.md)** - Detailed step-by-step instructions.
- **[API Reference](API_REFERENCE.md)** - Complete command and option reference.
- **[Troubleshooting](TROUBLESHOOTING.md)** - Solutions to common issues.
- **[Contributing](CONTRIBUTING.md)** - Help improve the PayMongo CLI.

---

## Built for Filipino Developers

PayMongo CLI is crafted to empower Filipino developers building the next generation of fintech solutions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

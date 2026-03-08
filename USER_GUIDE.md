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

- **Node.js**: v20.0.0 or higher
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
- **Development Port**: The port your local app's webhook handler is listening on (default: `3000`).

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

This is the most powerful feature of the CLI. It handles tunneling, webhook registration, and event forwarding automatically.

1.  **Start your local application** (e.g., on port 3000).
2.  **Start the PayMongo dev server**:

```bash
paymongo dev --port 3000
```

This command will:

- Create an ngrok tunnel (e.g., `https://random-id.ngrok-free.app`).
- Register a temporary webhook on PayMongo pointing to that tunnel.
- Forward all incoming events to `http://localhost:3000/webhook`.

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
| `-e, --events <events>` | Events to listen for                   |

**Features**:

- Automatic ngrok tunnel creation
- Webhook registration with PayMongo
- Signature verification
- Real-time event logging

#### `paymongo trigger`

**Purpose**: Simulate webhook events locally for testing.

**Authentication**: No (generates mock events).

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
paymongo config show --json  # Output as JSON
```

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

##### `webhooks delete <id>`

Delete a webhook (with confirmation).

| Option      | Description       |
| :---------- | :---------------- |
| `-y, --yes` | Skip confirmation |

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
| `-a, --amount <amount>`           | Amount in centavos (e.g., 10000 for ₱100.00) |
| `-c, --currency <currency>`       | Currency code (default: PHP)                 |
| `-d, --description <description>` | Payment description                          |
| `-j, --json`                      | JSON output                                  |

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

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
- **Collaborate**: Sync configurations with your team via GitHub.
- **Visualize**: Use the GUI dashboard for a real-time overview of your integration.

---

## 2. Prerequisites and Setup

### System Requirements

- **Node.js**: v18.0.0 or higher
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
3.  Configure the token in the CLI:

```bash
# Method 1: CLI Configuration (Recommended)
paymongo config set ngrok.authtoken YOUR_AUTHTOKEN

# Method 2: Environment Variable
export NGROK_AUTHTOKEN=YOUR_AUTHTOKEN
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

### `paymongo init`

Initialize a new project and set up credentials.

- `--non-interactive`: Skip prompts and use default/provided values.

### `paymongo dev`

Start local development server with webhook forwarding.

- `-p, --port <port>`: Local port to forward to (default: 3000).
- `--no-register`: Start server without registering a webhook on PayMongo.
- `-e, --events <events>`: Comma-separated events to listen for.

### `paymongo payments`

Manage payments and payment intents.

- `payments list`: Show recent payments.
- `payments create-intent`: Create a new payment intent.
  - `-a, --amount <centavos>`: Amount in centavos (e.g., 10000 for ₱100.00).
  - `-d, --description <text>`: Payment description.

### `paymongo webhooks`

Manage PayMongo webhooks.

- `webhooks list`: List all active webhooks.
- `webhooks create --url <url> --events <events>`: Create a new webhook.

### `paymongo gui`

Launch the web-based monitoring dashboard.

- `-p, --port <port>`: Dashboard port (default: 8080).

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

### File Structure and Configuration

The CLI manages configuration at both the project and system levels:

- **Project Level (`.paymongo`)**: Stores project-specific settings like the development port, active webhook IDs, and webhook secrets.
- **Environment (`.env`)**: Standard environment variables (`PAYMONGO_SECRET_KEY`, etc.) for your application to use.
- **System Level (`~/.paymongo/credentials.enc`)**: Stores your global API keys securely using AES-256-CBC encryption. This allows you to switch projects without re-authenticating.

### Team Collaboration

Sync your PayMongo configuration across your team using GitHub.

1.  **Authenticate with GitHub**:
    ```bash
    paymongo team auth --token YOUR_GITHUB_PAT
    ```
2.  **Sync Configuration**:
    ```bash
    paymongo team sync --repo owner/repo
    ```

This allows everyone on the team to use the same project settings without sharing secrets over insecure channels.

---

## 7. Troubleshooting

| Issue                     | Solution                                                                                                         |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| **ngrok authtoken error** | Run `paymongo config set ngrok.authtoken YOUR_TOKEN`.                                                            |
| **Connection Refused**    | Ensure your local app is running on the specified port (default: 3000).                                          |
| **Invalid API Key**       | Run `paymongo login` to update your credentials globally.                                                        |
| **Webhook not received**  | Check if the tunnel URL is active in the `paymongo dev` logs and registered in your PayMongo dashboard.          |
| **Signature Fail**        | Ensure `dev.verifyWebhookSignatures` is `false` if you haven't synced your secrets or are using manual webhooks. |

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

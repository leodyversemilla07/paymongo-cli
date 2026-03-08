# PayMongo CLI API Reference

This document provides a comprehensive technical reference for the PayMongo CLI. It covers all available commands, configuration options, and integration details.

---

## 1. Command Overview

| Command                                   | Description                                               |
| :---------------------------------------- | :-------------------------------------------------------- |
| [`paymongo init`](#paymongo-init)         | Initialize a new PayMongo project and setup credentials.  |
| [`paymongo dev`](#paymongo-dev)           | Start a local development server with webhook forwarding. |
| [`paymongo payments`](#paymongo-payments) | Manage payments and payment intents.                      |
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

Start a local development server that uses `ngrok` to forward PayMongo webhooks to your local machine.

**Syntax:**

```bash
paymongo dev [options]
```

**Options:**
| Option | Description | Default |
| :--- | :--- | :--- |
| `-p, --port <port>` | Port for the local webhook server | `3000` (from config) |
| `--no-register` | Skip automatic webhook registration with PayMongo | `false` |
| `-e, --events <events>` | Override events to listen for | (from config) |
| `--ngrok-token <token>` | Provide ngrok authtoken directly | (from config) |

**Logic:**

1. Starts an `ngrok` tunnel to your specified local port.
2. Starts a local HTTP server at `/webhook` to receive events.
3. Automatically creates a temporary webhook in PayMongo pointing to the tunnel URL (unless `--no-register` is used).
4. Forwards received payloads to your local application.

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

- `-a, --amount <amount>`: Amount in centavos (e.g., `10000` for ₱100.00).
- `-c, --currency <currency>`: Currency code (default: `PHP`).
- `-d, --description <description>`: Payment description.
- `-j, --json`: Output as raw JSON.

---

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

### paymongo config

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

Simulate PayMongo webhook events locally without making real payments. Great for testing your webhook handlers.

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

Credentials provided via `paymongo login` are stored in an encrypted file at `~/.paymongo/credentials.enc`. This ensures your keys are secure even if your project folder is compromised.

---

## 4. API Integration Details

The CLI interacts with the PayMongo V1 API.

**Base URL:** `https://api.paymongo.com/v1`

**Endpoints Used:**

- `GET /webhooks`: List all webhooks.
- `POST /webhooks`: Create a new webhook.
- `GET /webhooks/:id`: Retrieve a specific webhook.
- `PUT /webhooks/:id`: Update a webhook.
- `DELETE /webhooks/:id`: Delete a webhook.
- `GET /payments`: List recent payments.
- `GET /payments/:id`: Retrieve a specific payment.
- `POST /payment_intents`: Create a payment intent.

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

# PayMongo CLI User Guide

> A comprehensive guide to getting started with PayMongo CLI for seamless payment integration development.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Key Setup](#api-key-setup)
- [Command Reference](#command-reference)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Advanced Usage](#advanced-usage)

## Overview

PayMongo CLI is a developer-first tool that streamlines PayMongo integration development. It provides:

- **Local Development Server** with automatic webhook forwarding
- **Webhook Management** for real-time payment notifications
- **Payment Operations** for testing and monitoring
- **Team Collaboration** features for shared configurations
- **Interactive GUI** for monitoring and configuration

### Key Features

- 🚀 Zero-configuration setup with `paymongo init`
- 🔄 Automatic ngrok tunneling for webhook testing
- 📊 Real-time webhook event logging
- 💳 Payment intent creation and monitoring
- 👥 Team configuration sync via GitHub
- 🎛️ Web-based dashboard for monitoring
- 🔒 Secure API key management

## Quick Start

### 1. Install PayMongo CLI

```bash
npm install -g paymongo-cli
```

### 2. Initialize Your Project

```bash
# Create a new directory for your project
mkdir my-paymongo-app
cd my-paymongo-app

# Initialize PayMongo project
paymongo init
```

### 3. Start Development Server

```bash
# Start development server with webhook forwarding
paymongo dev
```

### 4. Test a Payment

```bash
# Create a test payment intent
paymongo payments create-intent --amount 10000 --description "Test Payment"

# Check webhook events in the terminal
# Visit the ngrok URL shown to trigger test webhooks
```

That's it! You're ready to develop with PayMongo.

## Installation

### Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Usually comes with Node.js
- **PayMongo Account**: [Create one at paymongo.com](https://dashboard.paymongo.com/)

### Method 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g paymongo-cli

# Verify installation
paymongo --version
paymongo --help
```

### Method 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/leodyver/paymongo-cli.git
cd paymongo-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage (or use npm link)
npm link

# Verify
paymongo --version
```

### Method 3: Using npx (No Installation)

```bash
# Use without installing
npx paymongo-cli --help

# Or with full package name
npx paymongo-cli@latest init
```

### Verification

After installation, verify everything works:

```bash
# Check version
paymongo --version

# View available commands
paymongo --help

# Check for updates (if applicable)
paymongo --version
```

## Configuration

### Project Configuration

The CLI uses a `.paymongo` configuration file in your project root. This file contains:

- Project metadata
- API keys (encrypted)
- Webhook settings
- Development preferences

### Configuration File Structure

```json
{
  "version": "1.0",
  "projectName": "My E-commerce Store",
  "environment": "test",
  "apiKeys": {
    "test": {
      "public": "pk_test_xxxxxxxxxxxxxxxxxx",
      "secret": "sk_test_xxxxxxxxxxxxxxxxxx"
    },
    "live": {
      "public": "pk_live_xxxxxxxxxxxxxxxxxx",
      "secret": "sk_live_xxxxxxxxxxxxxxxxxx"
    }
  },
  "webhooks": {
    "url": "https://myapp.com/webhook",
    "events": ["payment.paid", "payment.failed", "source.chargeable"]
  },
  "webhookSecrets": {
    "whook_abc123": "whsec_xxxxxxxxxxxxxxxxxx"
  },
  "dev": {
    "port": 3000,
    "autoRegisterWebhook": true,
    "verifyWebhookSignatures": false
  }
}
```

### Configuration Commands

#### View Configuration

```bash
# Show current configuration
paymongo config show

# Show as JSON
paymongo config show --json
```

#### Modify Configuration

```bash
# Set individual values
paymongo config set dev.port 4000
paymongo config set environment live
paymongo config set dev.autoRegisterWebhook false

# Reset to defaults
paymongo config reset
```

#### Backup and Restore

```bash
# Create a backup
paymongo config backup

# Create backup with custom name
paymongo config backup --name my-backup

# Import configuration from file
paymongo config import backup.json

# Force overwrite existing config
paymongo config import backup.json --force
```

## API Key Setup

### Getting Your API Keys

1. **Log in to PayMongo Dashboard**: [dashboard.paymongo.com](https://dashboard.paymongo.com/)
2. **Navigate to Settings** → **API Keys**
3. **Copy your keys**:
   - **Test Public Key**: `pk_test_xxxxxxxxxxxxxxxxxx`
   - **Test Secret Key**: `sk_test_xxxxxxxxxxxxxxxxxx`
   - **Live Public Key**: `pk_live_xxxxxxxxxxxxxxxxxx`
   - **Live Secret Key**: `sk_live_xxxxxxxxxxxxxxxxxx`

### Setting Up API Keys

#### Method 1: Interactive Setup (Recommended)

```bash
# Run init command for new projects
paymongo init

# Or login for existing projects
paymongo login
```

#### Method 2: Manual Configuration

```bash
# Set keys individually
paymongo login --key sk_test_xxxxxxxxxxxxxxxxxx --public-key pk_test_xxxxxxxxxxxxxxxxxx --env test
paymongo login --key sk_live_xxxxxxxxxxxxxxxxxx --public-key pk_live_xxxxxxxxxxxxxxxxxx --env live
```

#### Method 3: Environment Variables

```bash
# Set environment variables (useful for CI/CD)
export PAYMONGO_TEST_SECRET_KEY="sk_test_xxxxxxxxxxxxxxxxxx"
export PAYMONGO_TEST_PUBLIC_KEY="pk_test_xxxxxxxxxxxxxxxxxx"
export PAYMONGO_LIVE_SECRET_KEY="sk_live_xxxxxxxxxxxxxxxxxx"
export PAYMONGO_LIVE_PUBLIC_KEY="pk_live_xxxxxxxxxxxxxxxxxx"

# Then run login (will use env vars if available)
paymongo login
```

### Security Notes

- **Never commit API keys** to version control
- Use **test keys** for development
- **Live keys** should only be used in production
- Keys are **encrypted** and stored securely
- Use `paymongo login --logout` to clear stored keys

## Command Reference

### Core Commands

#### `paymongo init`

Initialize a new PayMongo project with interactive setup.

```bash
# Interactive setup (recommended)
paymongo init

# Non-interactive with all options
paymongo init \
  --name "My Store" \
  --env test \
  --key sk_test_xxx \
  --public-key pk_test_xxx \
  --port 4000 \
  --events payment.paid,payment.failed \
  --url https://myapp.com/webhook
```

**Options:**

- `-n, --name <name>` - Project name
- `-e, --env <environment>` - Environment (test/live)
- `-k, --key <key>` - Secret API key
- `-p, --port <port>` - Development port
- `--public-key <key>` - Public API key
- `-u, --url <url>` - Webhook URL
- `--events <events>` - Webhook events (comma-separated)

#### `paymongo login`

Manage API credentials securely.

```bash
# Interactive login
paymongo login

# Login with specific environment
paymongo login --env live

# Logout and clear credentials
paymongo login --logout

# Non-interactive login
paymongo login --key sk_test_xxx --public-key pk_test_xxx --env test
```

#### `paymongo dev`

Start local development server with automatic webhook forwarding.

```bash
# Start with default settings
paymongo dev

# Custom port
paymongo dev --port 4000

# Custom events
paymongo dev --events payment.paid,payment.failed,source.chargeable

# Skip webhook registration
paymongo dev --no-register
```

**Features:**

- Automatic ngrok tunnel creation
- Webhook registration with PayMongo
- Real-time webhook event logging
- Webhook signature verification (configurable)

### Webhook Management

#### `paymongo webhooks`

Manage PayMongo webhooks.

```bash
# List all webhooks
paymongo webhooks list

# List with JSON output
paymongo webhooks list --json

# Create webhook interactively
paymongo webhooks create

# Create webhook non-interactively
paymongo webhooks create \
  --url https://myapp.com/webhook \
  --events payment.paid,payment.failed

# Show webhook details
paymongo webhooks show whook_abc123

# Delete webhook (with confirmation)
paymongo webhooks delete whook_abc123

# Delete without confirmation
paymongo webhooks delete whook_abc123 --yes
```

### Payment Management

#### `paymongo payments`

Manage PayMongo payments and payment intents.

```bash
# List recent payments
paymongo payments list

# List with limit
paymongo payments list --limit 20

# Show payment details (completed payments only)
paymongo payments show pay_abc123

# Create payment intent
paymongo payments create-intent \
  --amount 10000 \
  --description "Premium Subscription" \
  --currency PHP

# Output as JSON
paymongo payments list --json
paymongo payments show pay_abc123 --json
```

**Amount Note:** Amount is in centavos (100 = ₱1.00 PHP)

### Configuration Management

#### `paymongo config`

View and modify CLI configuration.

```bash
# Show current configuration
paymongo config show

# Show as JSON
paymongo config show --json

# Set configuration values
paymongo config set dev.port 4000
paymongo config set environment live
paymongo config set dev.autoRegisterWebhook false

# Backup configuration
paymongo config backup

# Import configuration
paymongo config import backup.json --force

# Reset to defaults
paymongo config reset
```

### Webhook Testing

#### `paymongo trigger`

Simulate webhook events locally for testing.

```bash
# Trigger payment.paid event interactively
paymongo trigger

# Trigger specific event
paymongo trigger --event payment.failed

# Trigger with custom URL
paymongo trigger --event source.chargeable --url http://localhost:3000/webhook

# Output event data as JSON
paymongo trigger --event payment.paid --json
```

**Available Events:**

- `payment.paid` - Payment successful
- `payment.failed` - Payment failed
- `payment.refunded` - Payment refunded
- `source.chargeable` - Source ready for charging
- `checkout_session.payment.paid` - Checkout payment successful
- `link.payment.paid` - Payment link payment successful
- `qrph.expired` - QR Ph expired

### Team Collaboration

#### `paymongo team`

Team collaboration features via GitHub.

```bash
# Set up GitHub authentication
paymongo team auth

# Sync configuration with team repository
paymongo team sync --repo myorg/paymongo-configs

# Sync with specific branch
paymongo team sync --repo myorg/paymongo-configs --branch develop

# Force overwrite
paymongo team sync --repo myorg/paymongo-configs --force

# List team members (repository info)
paymongo team members

# Invite team member (placeholder)
paymongo team invite user@example.com --role developer
```

### Web Dashboard

#### `paymongo gui`

Start the web-based GUI dashboard.

```bash
# Start GUI on default port 8080
paymongo gui

# Custom port
paymongo gui --port 3000

# Custom host
paymongo gui --host 0.0.0.0
```

**Features:**

- Real-time webhook monitoring
- Configuration management interface
- Webhook status overview
- Analytics dashboard
- Live event log with Socket.io

## Development Workflow

### Typical Development Cycle

#### 1. Project Setup

```bash
# Create project directory
mkdir my-ecommerce-app
cd my-ecommerce-app

# Initialize PayMongo project
paymongo init
```

#### 2. Development Server

```bash
# Start development server
paymongo dev

# Server will:
# - Create ngrok tunnel
# - Register webhook with PayMongo
# - Start local server on port 3000
# - Forward webhooks to http://localhost:3000/webhook
```

#### 3. Webhook Testing

```bash
# In another terminal, test webhooks
paymongo trigger --event payment.paid

# Or create real payment intents
paymongo payments create-intent --amount 50000 --description "Test Order"
```

#### 4. Monitor Activity

```bash
# Check recent payments
paymongo payments list

# View webhook activity (in dev server terminal)
# Webhook events will be logged automatically
```

#### 5. Production Deployment

```bash
# Switch to live environment
paymongo config set environment live

# Update webhook URL for production
paymongo config set webhooks.url https://myapp.com/api/webhooks

# Register production webhook
paymongo webhooks create --url https://myapp.com/api/webhooks
```

### Webhook Development

#### Setting Up Webhook Handler

```javascript
// Express.js example
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook', (req, res) => {
  const event = req.body;

  console.log('Received webhook:', event.data.type);

  switch (event.data.type) {
    case 'payment.paid':
      // Handle successful payment
      const payment = event.data.attributes.data;
      console.log(
        `Payment ${payment.id} succeeded: ₱${(payment.attributes.amount / 100).toFixed(2)}`
      );
      break;

    case 'payment.failed':
      // Handle failed payment
      const failedPayment = event.data.attributes.data;
      console.log(`Payment ${failedPayment.id} failed`);
      break;

    case 'source.chargeable':
      // Handle source ready for charging
      const source = event.data.attributes.data;
      console.log(`Source ${source.id} is chargeable`);
      break;
  }

  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

#### Testing Webhooks Locally

```bash
# Start your webhook server
node server.js

# In another terminal, start PayMongo dev server
paymongo dev

# Test webhook events
paymongo trigger --event payment.paid
paymongo trigger --event payment.failed
```

## Troubleshooting

### Common Issues

#### "No configuration found"

**Problem:** CLI can't find `.paymongo` configuration file.

**Solutions:**

```bash
# Initialize project
paymongo init

# Check if you're in the right directory
ls -la | grep .paymongo

# Check current directory
pwd
```

#### "Invalid API key"

**Problem:** API key validation fails.

**Solutions:**

```bash
# Check your API keys in PayMongo dashboard
# Ensure you're using the correct environment (test/live)
paymongo config set environment test

# Re-login with correct keys
paymongo login --logout
paymongo login
```

#### "ngrok tunnel failed"

**Problem:** Can't create ngrok tunnel for webhook forwarding.

**Solutions:**

```bash
# Check internet connection
ping google.com

# Try different port
paymongo dev --port 3001

# Check ngrok status
# Visit https://ngrok.com for status updates
```

#### "Webhook signature verification failed"

**Problem:** Webhook signatures don't match.

**Solutions:**

```bash
# Disable signature verification for development
paymongo config set dev.verifyWebhookSignatures false

# Enable and register webhook properly
paymongo config set dev.verifyWebhookSignatures true
paymongo dev  # This will register webhook with secret
```

#### "Command not found"

**Problem:** PayMongo CLI not installed or not in PATH.

**Solutions:**

```bash
# Install globally
npm install -g paymongo-cli

# Check PATH
which paymongo

# Use npx if installed locally
npx paymongo-cli --help
```

### Error Codes

- **400 Bad Request**: Invalid request parameters
- **401 Unauthorized**: Invalid or missing API key
- **404 Not Found**: Resource doesn't exist
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: PayMongo API error

### Debug Mode

Enable verbose logging:

```bash
# Set log level
export DEBUG=paymongo-cli:*

# Run command with debug output
paymongo dev
```

### Getting Help

```bash
# View help for any command
paymongo --help
paymongo dev --help
paymongo webhooks --help

# Check version
paymongo --version
```

## Best Practices

### Security

- **Never commit API keys** to version control
- Use **test environment** for development
- **Rotate API keys** regularly in production
- Enable **webhook signature verification** in production
- Use **HTTPS** for webhook endpoints

### Development

- **Use test API keys** exclusively in development
- **Test webhooks locally** before deploying
- **Monitor webhook events** in development server
- **Backup configurations** before major changes
- **Use meaningful descriptions** for payment intents

### Production Deployment

- **Switch to live environment** before deploying
- **Update webhook URLs** to production endpoints
- **Enable signature verification** for security
- **Monitor webhook delivery** and failures
- **Set up proper error handling** for webhook events

### Team Collaboration

- **Use team sync** for shared configurations
- **Document webhook secrets** securely
- **Standardize event handling** across team
- **Review webhook endpoints** before merging

## Advanced Usage

### Custom Webhook Events

Define custom webhook events for specific use cases:

```bash
# Monitor multiple payment events
paymongo dev --events payment.paid,payment.failed,payment.refunded

# Add source events for card payments
paymongo dev --events payment.paid,source.chargeable

# Include checkout session events
paymongo dev --events payment.paid,checkout_session.payment.paid
```

### Environment-Specific Configurations

Manage different configurations for test and live environments:

```bash
# Test environment
paymongo config set environment test
paymongo config set webhooks.url http://localhost:3000/webhook

# Live environment
paymongo config set environment live
paymongo config set webhooks.url https://myapp.com/api/webhooks
```

### Batch Operations

Automate common workflows with scripts:

```bash
#!/bin/bash
# setup-project.sh

# Initialize project
paymongo init --name "My App" --env test --port 3000

# Start development server in background
paymongo dev &
DEV_PID=$!

# Wait for server to start
sleep 5

# Test webhook
paymongo trigger --event payment.paid

# Kill background server
kill $DEV_PID
```

### CI/CD Integration

Use environment variables for automated deployments:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install PayMongo CLI
        run: npm install -g paymongo-cli

      - name: Configure PayMongo
        run: |
          paymongo login --key ${{ secrets.PAYMONGO_SECRET_KEY }} --env live
          paymongo config set webhooks.url ${{ secrets.WEBHOOK_URL }}

      - name: Register Webhook
        run: paymongo webhooks create --url ${{ secrets.WEBHOOK_URL }}
```

### Monitoring and Analytics

Monitor your PayMongo integration health:

```bash
# Check recent payment activity
paymongo payments list --limit 50

# Monitor webhook delivery
paymongo webhooks list

# View detailed webhook information
paymongo webhooks show whook_abc123

# Check configuration status
paymongo config show
```

### Custom Integrations

Extend CLI functionality with custom scripts:

```javascript
// custom-payment-monitor.js
const { execSync } = require('child_process');

function monitorPayments() {
  try {
    // Get recent payments
    const output = execSync('paymongo payments list --json', { encoding: 'utf8' });
    const payments = JSON.parse(output);

    // Analyze payment patterns
    const successfulPayments = payments.filter((p) => p.attributes.status === 'paid');
    const totalAmount = successfulPayments.reduce((sum, p) => sum + p.attributes.amount, 0);

    console.log(`✅ ${successfulPayments.length} successful payments`);
    console.log(`💰 Total: ₱${(totalAmount / 100).toFixed(2)}`);
  } catch (error) {
    console.error('Failed to monitor payments:', error.message);
  }
}

// Run every 5 minutes
setInterval(monitorPayments, 5 * 60 * 1000);
monitorPayments();
```

---

## Support and Resources

- **PayMongo Documentation**: [developers.paymongo.com](https://developers.paymongo.com)
- **GitHub Repository**: [github.com/leodyver/paymongo-cli](https://github.com/leodyver/paymongo-cli)
- **Issue Tracker**: [github.com/leodyver/paymongo-cli/issues](https://github.com/leodyver/paymongo-cli/issues)
- **Community**: [Discord Community](https://discord.gg/paymongo)

## Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

---

**Made with ❤️ for Filipino developers** 🇵🇭</content>
<parameter name="filePath">USER_GUIDE.md

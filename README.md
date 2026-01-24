# PayMongo CLI 🚀

> **A developer-first CLI for PayMongo integration with local webhook forwarding.**

PayMongo CLI is the official-feel command-line tool designed to streamline your development process with PayMongo. It solves the biggest pain point in payment integration: **testing webhooks locally**.

[![npm version](https://img.shields.io/npm/v/paymongo-cli.svg)](https://www.npmjs.com/package/paymongo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ Key Features

- 🔄 **Local Webhook Forwarding**: Seamlessly receive PayMongo webhooks on your localhost using integrated `ngrok` tunneling.
- 🚀 **Zero-Config Setup**: Get started in seconds with `paymongo init`.
- 💳 **Payment Testing**: Create and monitor payment intents and payments directly from your terminal.
- 📊 **Real-time Monitoring**: Watch webhook events as they happen with formatted logs or a web-based GUI.
- 👥 **Team Collaboration**: Sync configurations across your team using GitHub integration.
- 🎛️ **Web Dashboard**: Use `paymongo gui` for a premium visual monitoring experience.
- 🔒 **Secure Management**: Encrypted storage for your API keys.

---

## 📦 Installation

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **ngrok account**: Required for webhook forwarding (free tier works great!)

### Install via npm (Recommended)

```bash
npm install -g paymongo-cli
```

### Setup ngrok Authtoken

To use the `dev` server with webhook forwarding, you need an ngrok authtoken:

1. Sign up at [ngrok.com](https://ngrok.com)
2. Copy your authtoken from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Configure it in the CLI:

```bash
paymongo config set ngrok.authtoken YOUR_AUTHTOKEN
```

---

## 🚀 Quick Start

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

## 🛠 Commands Reference

| Command             | Description                                             |
| :------------------ | :------------------------------------------------------ |
| `paymongo init`     | Initialize a new project and set up credentials.        |
| `paymongo dev`      | Start local development server with webhook forwarding. |
| `paymongo payments` | Manage payments and payment intents.                    |
| `paymongo webhooks` | List, create, and manage PayMongo webhooks.             |
| `paymongo config`   | View and modify CLI configuration.                      |
| `paymongo team`     | Sync configurations with your team via GitHub.          |
| `paymongo gui`      | Launch the web-based monitoring dashboard.              |
| `paymongo trigger`  | Simulate webhook events locally for testing.            |

> 💡 Use `paymongo <command> --help` for detailed information on any command.

---

## 📖 Documentation

- **[Installation Guide](INSTALLATION.md)** - Platform-specific setup instructions.
- **[User Guide](USER_GUIDE.md)** - Detailed step-by-step instructions.
- **[API Reference](API_REFERENCE.md)** - Complete command and option reference.
- **[Troubleshooting](TROUBLESHOOTING.md)** - Solutions to common issues.
- **[Contributing](CONTRIBUTING.md)** - Help improve the PayMongo CLI.

---

## 🇵🇭 Built for Filipino Developers

PayMongo CLI is crafted with ❤️ to empower Filipino developers building the next generation of fintech solutions.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

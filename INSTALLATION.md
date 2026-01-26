# Installation Guide

This guide provides step-by-step instructions for installing the PayMongo CLI on various platforms and setting up your development environment.

## System Requirements

- **Node.js**: v20.0.0 or higher
- **npm**: v9.0.0 or higher
- **Operating System**:
  - Windows 10/11
  - macOS 12 (Monterey) or higher
  - Linux (Ubuntu 20.04+, Debian 11+, Fedora 36+)

---

## Global Installation

The easiest way to install PayMongo CLI is via npm. This makes the `paymongo` command available globally on your system.

### 1. Install via npm

```bash
npm install -g paymongo-cli
```

### 2. Verify Installation

Check if the CLI is installed correctly by running:

```bash
paymongo --version
```

---

## Platform-Specific Setup

### 🪟 Windows

1. **Install Node.js**: Download and install the latest LTS version from [nodejs.org](https://nodejs.org/).
2. **Execution Policy**: If you encounter errors running scripts in PowerShell, you may need to set the execution policy:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. **Environment Variables**: To set the ngrok authtoken permanently:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('NGROK_AUTHTOKEN', 'your_token_here', 'User')
   ```
   _Note: Restart your terminal after setting environment variables._

### 🍎 macOS

1. **Install via Homebrew (Optional)**: If you prefer Homebrew for managing Node.js:
   ```bash
   brew install node
   ```
2. **Install CLI**:
   ```bash
   npm install -g paymongo-cli
   ```
3. **Environment Setup**: Add the authtoken to your shell profile (`.zshrc` or `.bash_profile`):
   ```bash
   echo 'export NGROK_AUTHTOKEN="your_token_here"' >> ~/.zshrc
   source ~/.zshrc
   ```

### 🐧 Linux

1. **Install Node.js**: Use your package manager (e.g., `apt` for Ubuntu):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. **Permissions**: If you get `EACCES` errors during global installation, use a version manager like `nvm` or fix npm permissions:
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   ```
3. **CLI Installation**:
   ```bash
   npm install -g paymongo-cli
   ```

---

## 🔑 ngrok Setup

Webhook forwarding requires [ngrok](https://ngrok.com). While the CLI manages the tunnel for you, you must provide an authtoken.

1. **Create an Account**: Sign up for free at [dashboard.ngrok.com](https://dashboard.ngrok.com/signup).
2. **Get your Token**: Navigate to [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) in the dashboard.
3. **Configure the CLI**:
   ```bash
   paymongo config set ngrok.authtoken YOUR_AUTHTOKEN
   ```
   _Alternatively, set the `NGROK_AUTHTOKEN` environment variable._

---

## 🏗 Development Setup

If you want to contribute to the project or build from source:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/leodyversemilla07/paymongo-cli.git
   cd paymongo-cli
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Build the Project**:
   ```bash
   npm run build
   ```
4. **Link for Local Development**:
   ```bash
   npm link
   ```
   _Now the `paymongo` command will point to your local development build._

---

## ✅ Post-Installation Verification

To ensure everything is working correctly:

1. **Initialize a dummy project**:
   ```bash
   mkdir test-paymongo
   cd test-paymongo
   paymongo init
   ```
2. **Check Configuration**:
   ```bash
   paymongo config show
   ```
3. **Test API connectivity** (Requires PayMongo API Keys):
   ```bash
   paymongo webhooks list
   ```

---

## ❓ Troubleshooting

- **Command Not Found**: Ensure your npm global binaries directory is in your system's `PATH`.
- **Node.js Version**: Verify you are using Node.js 20+ with `node -v`.
- **ngrok Errors**: If the tunnel fails to start, verify your authtoken with `paymongo dev --ngrok-token <token>`.
- **Permission Denied**: On Unix-based systems, avoid using `sudo` for npm global installs. Use `nvm` or follow the permission fix in the Linux section.

---

## Upgrading

To upgrade to the latest version of PayMongo CLI:

```bash
npm update -g paymongo-cli
```

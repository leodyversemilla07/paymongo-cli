# Troubleshooting Guide

This guide provides solutions to common issues you might encounter while using the PayMongo CLI. If you're stuck, check this document first.

---

## 📋 Table of Contents

1.  [Installation Problems](#1-installation-problems)
2.  [ngrok Issues](#2-ngrok-issues)
3.  [PayMongo API Issues](#3-paymongo-api-issues)
4.  [Development Server Issues](#4-development-server-issues)
5.  [Configuration Issues](#5-configuration-issues)
6.  [Diagnostic Tools](#6-diagnostic-tools)
7.  [Advanced Troubleshooting](#7-advanced-troubleshooting)
8.  [Prevention Tips](#8-prevention-tips)

---

## 1. Installation Problems

### npm permission errors (`EACCES`)

**Issue**: You receive a "permission denied" error when running `npm install -g paymongo-cli`.
**Solution**: This happens when you don't have write access to the global npm directory.

- **Recommended**: Use a version manager like `nvm` (Node Version Manager) which handles permissions automatically.
- **Manual Fix (Linux/macOS)**:
  ```bash
  mkdir ~/.npm-global
  npm config set prefix '~/.npm-global'
  export PATH=~/.npm-global/bin:$PATH
  source ~/.bashrc # or ~/.zshrc
  ```

### Node.js version conflicts

**Issue**: `paymongo` command fails with syntax errors or "Module not found".
**Solution**: Ensure you are using Node.js **v20.0.0** or higher.

- Check version: `node -v`
- Upgrade Node.js at [nodejs.org](https://nodejs.org/).

### PATH issues

**Issue**: `command not found: paymongo` after successful installation.
**Solution**: The npm global bin directory is not in your system's PATH.

- **Windows**: Add `%AppData%\npm` to your Environment Variables.
- **macOS/Linux**: Add `$(npm config get prefix)/bin` to your shell profile.

---

## 2. ngrok Issues

### Authtoken not recognized

**Issue**: `Tunnel failed: authentication failed`.
**Solution**: Your ngrok authtoken is missing or invalid.

- Configure it: `paymongo config set ngrok.authtoken YOUR_TOKEN`
- Or use environment variable: `export NGROK_AUTHTOKEN=YOUR_TOKEN`

### Tunnel creation failures

**Issue**: `Failed to start ngrok tunnel`.
**Solution**:

- **Network/Firewall**: Ensure your firewall or antivirus isn't blocking ngrok.
- **Multiple Instances**: ngrok free tier only allows **one active tunnel** at a time. Close other ngrok processes.
- **Regional Issues**: Try specifying a region (if supported by CLI) or check [ngrok status](https://status.ngrok.com/).

### Free tier limitations

**Issue**: Tunnel closes frequently or hits bandwidth limits.
**Solution**: ngrok's free tier has usage limits. If you're doing heavy testing, consider an ngrok Pro plan or reduce the frequency of webhook triggers.

---

## 3. PayMongo API Issues

### Invalid API keys

**Issue**: `401 Unauthorized` or `Invalid API Key`.
**Solution**:

- Ensure you are using the correct key type. **Secret keys** (starting with `sk_`) are required for most operations.
- Verify the environment: `sk_test_...` for Test mode and `sk_live_...` for Live mode.
- Update keys: `paymongo login`

### Rate limiting

**Issue**: `429 Too Many Requests`.
**Solution**: The CLI includes automatic retries with exponential backoff. If the issue persists, reduce the frequency of your API calls.

### Webhook registration failures

**Issue**: `paymongo dev` fails to register a webhook on the PayMongo dashboard.
**Solution**:

- Ensure your Secret API key has permission to manage webhooks.
- Check if you have reached the maximum number of webhooks (PayMongo allows up to 5 per environment). Delete unused webhooks: `paymongo webhooks list` then `paymongo webhooks delete --id <id>`.

---

## 4. Development Server Issues

### Port conflicts

**Issue**: `Error: listen EADDRINUSE: address already in use :::3000`.
**Solution**: Another process is using port 3000.

- Kill the process or use a different port:
  ```bash
  paymongo dev --port 4000
  ```

### Webhook signature verification failed

**Issue**: CLI logs `Warning: Invalid webhook signature`.
**Solution**:

- If you're using `paymongo dev`, the secret should be handled automatically.
- Ensure your local app isn't modifying the raw request body before it reaches the verification logic.
- If you don't need verification for local dev, disable it:
  ```bash
  paymongo config set dev.verifyWebhookSignatures false
  ```

### Local network access

**Issue**: Webhooks are received by the CLI but not reaching your app.
**Solution**: Ensure your local development server (e.g., Express, Laravel, Next.js) is actually running and listening on the port you provided to `paymongo dev`.

---

## 5. Configuration Issues

### Environment variables not loading

**Issue**: Your app doesn't see `PAYMONGO_SECRET_KEY`.
**Solution**:

- Ensure `.env` was created by `paymongo init`.
- Use a library like `dotenv` in your application to load the variables.

### Multiple projects confusion

**Issue**: CLI is using settings from a different project.
**Solution**: The CLI looks for a `.paymongo` file in the **current working directory**. Ensure you are in the correct project folder.

---

## Diagnostic Tools

Run these commands to provide more info when reporting a bug:

- **Check Version**: `paymongo --version`
- **Show Current Config**: `paymongo config show` (excludes secrets by default)
- **Test Connectivity**: `paymongo webhooks list`
- **Validate Setup**: `paymongo init --verify`

**Log Locations**:

- The CLI logs directly to the console.
- For detailed debug logs, run: `DEBUG=paymongo:* paymongo <command>`

---

## Advanced Troubleshooting

### Manual Webhook Testing

If you think the tunnel isn't working, bypass it by triggering a local event:

```bash
paymongo trigger --event payment.paid --url http://localhost:3000/webhook
```

### API Key Validation

Verify if your key is active:

```bash
curl https://api.paymongo.com/v1/payments \
  -u <your_secret_key>: \
  -G
```

### ngrok Status Checking

Visit [http://localhost:4040](http://localhost:4040) while `paymongo dev` is running to see the ngrok diagnostic dashboard.

---

## Prevention Tips

1.  **Always use Test Keys**: Never use live keys for development.
2.  **Git Ignore**: Ensure `.paymongo` and `.env` are in your `.gitignore`.
3.  **Regular Updates**: Keep the CLI updated: `npm install -g paymongo-cli@latest`.
4.  **Backup Config**: If you have complex team settings, ensure your `team sync` is up to date.

---

**Still having trouble?**
Open an issue on [GitHub](https://github.com/leodyversemilla07/paymongo-cli/issues) with your diagnostic info!

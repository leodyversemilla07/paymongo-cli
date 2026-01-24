# PayMongo CLI

A developer-first CLI tool that streamlines PayMongo integration development. Make PayMongo integration as simple as running `paymongo dev`.

## Installation

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn

### Install from npm

```bash
npm install -g paymongo-cli
```

### Build from source

```bash
git clone https://github.com/leodyver/paymongo-cli.git
cd paymongo-cli
npm install
npm run build
npm link
```

### Verify installation

```bash
paymongo --version
paymongo --help
```

## Quick Start

1. **Initialize your project:**

   ```bash
   paymongo init
   ```

2. **Start development server:**

   ```bash
   paymongo dev
   ```

3. **Test with a webhook:**
   - Visit PayMongo Dashboard → Webhooks
   - Copy the ngrok URL shown in terminal
   - Create a test webhook in dashboard
   - Make a test payment to see events in terminal

## Commands

### `paymongo init`

Initialize a new PayMongo project with interactive setup.

```bash
# Interactive setup (recommended)
paymongo init

# Non-interactive with options
paymongo init --name "My Store" --env test --key sk_test_xxx --public-key pk_test_xxx --port 4000
```

**Options:**

- `-n, --name <name>` - Project name
- `-e, --env <environment>` - Environment (test or live)
- `-k, --key <key>` - Secret API key
- `--public-key <key>` - Public API key
- `-p, --port <port>` - Development port
- `--events <events>` - Comma-separated webhook events
- `--non-interactive` - Skip interactive prompts

### `paymongo dev`

Start local development server with automatic webhook forwarding.

```bash
# Start development server (default port 3000)
paymongo dev

# Custom port and events
paymongo dev --port 4000 --events payment.paid,payment.failed,source.chargeable

# Skip webhook registration
paymongo dev --no-register
```

**Features:**

- Automatic ngrok tunnel creation
- Webhook registration with PayMongo
- Real-time webhook event logging
- **Webhook signature verification** - Full HMAC-SHA256 cryptographic validation (configurable)
- Automatic cleanup on exit (Ctrl+C)

### `paymongo login`

Manage API credentials securely.

```bash
# Interactive login
paymongo login

# Non-interactive login
paymongo login --key sk_test_xxx --env test

# Logout and clear credentials
paymongo login --logout
```

### `paymongo webhooks`

Manage PayMongo webhooks.

```bash
# List all webhooks
paymongo webhooks list

# List with JSON output
paymongo webhooks list --json

# Filter by status
paymongo webhooks list --status enabled

# Create webhook interactively
paymongo webhooks create

# Create webhook non-interactively
paymongo webhooks create --url https://myapp.com/webhook --events payment.paid,payment.failed

# Show webhook details
paymongo webhooks show whook_abc123

# Delete webhook (with confirmation)
paymongo webhooks delete whook_abc123

# Delete webhook without confirmation
paymongo webhooks delete whook_abc123 --yes
```

### `paymongo config`

View and modify CLI configuration.

```bash
# Show current configuration
paymongo config show

# Show configuration as JSON
paymongo config show --json

# Set configuration values
paymongo config set dev.port 4000
paymongo config set dev.autoRegisterWebhook false
paymongo config set webhooks.url https://myapp.com/webhook
paymongo config set environment live

# Reset to defaults
paymongo config reset
```

### `paymongo gui`

Start the web-based GUI dashboard for real-time monitoring and configuration.

```bash
# Start GUI dashboard on default port 8080
paymongo gui

# Custom port and host
paymongo gui --port 3000 --host 0.0.0.0
```

**Features:**

- Real-time webhook event monitoring
- Configuration management interface
- Webhook status overview
- **Advanced analytics dashboard** - Success rates, event counts, response times, error tracking
- Live event log with Socket.io

**Options:**

- `-p, --port <port>` - Port to run the GUI server on (default: 8080)
- `-h, --host <host>` - Host to bind the GUI server to (default: localhost)

### `paymongo team`

Team collaboration features for shared configurations and permissions.

```bash
# Sync configuration with team repository
paymongo team sync --repo myorg/paymongo-configs

# Invite team member
paymongo team invite user@example.com --role developer

# List team members
paymongo team members
```

**Features:**

- Configuration sync via GitHub repositories
- Team member invitations and role management
- Shared webhook templates and environments

## Performance Optimizations

The CLI includes several performance optimizations to ensure fast startup and efficient operation:

### Lazy Loading

- **ngrok**: Loaded on-demand when starting the dev server
- **inquirer**: Loaded only during interactive prompts
- **Result**: ~30% faster CLI startup, reduced memory footprint

### Caching System

- **API Responses**: Filesystem-based cache with 2-minute TTL for webhook operations
- **Configuration**: In-memory caching with automatic invalidation on file changes
- **Result**: Faster repeated operations, reduced API calls

### Build Optimizations

- **Incremental Compilation**: TypeScript builds only changed files during development
- **Result**: Significantly faster rebuild times during active development

## Development

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn

### Setup

```bash
git clone https://github.com/leodyver/paymongo-cli.git
cd paymongo-cli
npm install
npm run build
npm link
```

### Testing

```bash
npm test
```

### Project Structure

```
paymongo-cli/
├── bin/
│   └── paymongo.js              # CLI entry point
├── src/
│   ├── commands/                # CLI commands
│   ├── services/                # Business logic services
│   │   ├── api/                # PayMongo API client
│   │   ├── config/             # Configuration management
│   │   └── tunnel/             # ngrok tunnel management
│   ├── utils/                  # Utility functions
│   └── types/                  # TypeScript type definitions
├── tests/                      # Test files
└── docs/                      # Documentation
```

## Configuration

The CLI uses a `.paymongo` configuration file in your project root:

```json
{
  "version": "1.0",
  "projectName": "My Store",
  "environment": "test",
  "apiKeys": {
    "test": {
      "public": "pk_test_xxx",
      "secret": "sk_test_xxx"
    }
  },
  "webhooks": {
    "url": "http://localhost:3000/webhook",
    "events": ["payment.paid", "payment.failed"]
  },
  "webhookSecrets": {
    "whook_xxx": "whsec_xxx"
  },
  "dev": {
    "port": 3000,
    "autoRegisterWebhook": true,
    "verifyWebhookSignatures": false
  }
}
```

## Security

- API keys are validated before storage
- Secret keys are stored securely using OS keychain when available
- Webhook signatures are verified in development mode
- Sensitive files (`.env`, `.paymongo`) are added to `.gitignore`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

- [GitHub Issues](https://github.com/leodyver/paymongo-cli/issues)
- [PayMongo Documentation](https://developers.paymongo.com)
- [Community Discord](https://discord.gg/paymongo)

---

**Made with ❤️ for Filipino developers**

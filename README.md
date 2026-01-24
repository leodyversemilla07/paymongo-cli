# PayMongo CLI

> A developer-first CLI tool that streamlines PayMongo integration development. Make PayMongo integration as simple as running `paymongo dev`.

PayMongo CLI provides everything you need for seamless payment integration development:

- 🚀 **Zero-configuration setup** with `paymongo init`
- 🔄 **Automatic webhook forwarding** during development
- 📊 **Real-time webhook monitoring** and event logging
- 💳 **Payment testing tools** for creating and monitoring transactions
- 👥 **Team collaboration** with GitHub-based configuration sync
- 🎛️ **Web dashboard** for monitoring and configuration
- 🔒 **Secure credential management** with encrypted storage

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

### 1. Install PayMongo CLI

```bash
npm install -g paymongo-cli
```

### 2. Initialize Your Project

```bash
# Create and enter project directory
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

### 4. Test Integration

```bash
# Create a test payment intent
paymongo payments create-intent --amount 10000 --description "Test Payment"

# Check webhook events in the terminal
# Visit the ngrok URL shown to trigger test webhooks
```

> 📖 **Need detailed instructions?** See the [complete User Guide](USER_GUIDE.md)

## Commands

The CLI provides comprehensive tools for PayMongo integration:

### Core Commands

- **`paymongo init`** - Initialize a new PayMongo project
- **`paymongo login`** - Manage API credentials securely
- **`paymongo dev`** - Start local development server with webhook forwarding

### Management Commands

- **`paymongo webhooks`** - Manage PayMongo webhooks (list, create, show, delete)
- **`paymongo payments`** - Manage payments and payment intents (list, show, create-intent)
- **`paymongo config`** - View and modify configuration

### Development Tools

- **`paymongo trigger`** - Simulate webhook events locally
- **`paymongo gui`** - Start web-based monitoring dashboard
- **`paymongo team`** - Team collaboration features

> 📖 **Complete command reference:** See the [User Guide](USER_GUIDE.md#command-reference)

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

## Documentation

- **[User Guide](USER_GUIDE.md)** - Comprehensive setup and usage documentation
- **[Command Reference](docs/commands.md)** - Detailed command documentation
- **[API Documentation](https://developers.paymongo.com)** - PayMongo API reference

---

**Made with ❤️ for Filipino developers**

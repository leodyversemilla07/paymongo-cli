# PayMongo CLI Commands Documentation

## Command Overview

The PayMongo CLI provides comprehensive tools for PayMongo integration development with the following commands:

### Core Commands

#### `paymongo init`

**Purpose**: Initialize a new PayMongo project with configuration
**Authentication**: No API authentication required (sets up credentials)
**Parameters**:

- `-n, --name <name>` - Project name
- `-e, --env <environment>` - Environment (test/live), default: test
- `-k, --key <key>` - Secret API key
- `--public-key <key>` - Public API key
- `-u, --url <url>` - Webhook URL
- `-p, --port <port>` - Development port, default: 3000
- `--events <events>` - Comma-separated webhook events
- `--non-interactive` - Skip interactive prompts

#### `paymongo login`

**Purpose**: Manage API credentials securely
**Authentication**: No (manages authentication)
**Subcommands**:

- Interactive login: `paymongo login`
- Non-interactive: `paymongo login --key sk_test_xxx --env test`
- Logout: `paymongo login --logout`

### Development Commands

#### `paymongo dev`

**Purpose**: Start local development server with ngrok tunnel and webhook handling
**Authentication**: Required (uses API keys for webhook registration)
**Parameters**:

- `-p, --port <port>` - Port for webhook server, default: 3000
- `--no-register` - Skip automatic webhook registration
- `-e, --events <events>` - Events to listen for

**Features**: Automatic ngrok tunnel, webhook registration, signature verification, real-time event logging

#### `paymongo trigger`

**Purpose**: Simulate webhook events locally for testing
**Authentication**: No (generates mock events)
**Parameters**:

- `-e, --event <event>` - Specific event type to trigger
- `-u, --url <url>` - Webhook URL to send to
- `-j, --json` - Output event data as JSON

**Supported Events**: payment.paid, payment.failed, payment.refunded, source.chargeable, checkout_session.payment.paid, link.payment.paid, qrph.expired

### Configuration Commands

#### `paymongo config`

**Purpose**: View and modify CLI configuration
**Authentication**: No
**Subcommands**:

**`config show`**

- Display current configuration
- `-j, --json` - Output as JSON

**`config set <key> <value>`**

- Set configuration value
- Examples: `config set dev.port 4000`, `config set environment live`

**`config reset`**

- Reset configuration to defaults

**`config backup`**

- Create timestamped backup of current configuration
- `-d, --directory <dir>` - Backup directory
- `-n, --name <name>` - Custom filename prefix

**`config import <file>`**

- Import configuration from JSON file
- `-f, --force` - Overwrite existing config

### Webhook Management

#### `paymongo webhooks`

**Purpose**: Manage PayMongo webhooks
**Authentication**: Required (API operations)
**Subcommands**:

**`webhooks list`**

- List all webhooks
- `-j, --json` - JSON output
- `-s, --status <status>` - Filter by status (enabled/disabled)

**`webhooks create`**

- Create new webhook interactively or with options
- `-u, --url <url>` - Webhook URL
- `-e, --events <events>` - Comma-separated events

**`webhooks show <id>`**

- Show detailed webhook information

**`webhooks delete <id>`**

- Delete webhook (with confirmation)
- `-y, --yes` - Skip confirmation

### GUI Dashboard

#### `paymongo gui`

**Purpose**: Start web-based GUI dashboard for monitoring
**Authentication**: Required (for API operations)
**Parameters**:

- `-p, --port <port>` - Port for GUI server, default: 8080
- `-h, --host <host>` - Host to bind to, default: localhost

**Features**: Real-time webhook monitoring, configuration management, webhook status overview, analytics dashboard

### Payment Management

#### `paymongo payments`

**Purpose**: Manage PayMongo payments and payment intents
**Authentication**: Required (API operations)
**Subcommands**:

**`payments list`**

- List recent payments (default limit: 10)
- `-l, --limit <number>` - Number of payments to show
- `-j, --json` - JSON output

**`payments show <id>`**

- Show detailed payment information
- `-j, --json` - JSON output

**`payments create-intent`**

- Create a new payment intent
- `-a, --amount <amount>` - Amount in centavos (e.g., 10000 for ₱100.00)
- `-c, --currency <currency>` - Currency code (default: PHP)
- `-d, --description <description>` - Payment description
- `-j, --json` - JSON output

### Team Collaboration

#### `paymongo team`

**Purpose**: Team collaboration features via GitHub
**Authentication**: GitHub token required for sync operations
**Subcommands**:

**`team sync`**

- Sync configuration with team repository
- `-r, --repo <repo>` - GitHub repository (owner/repo)
- `-b, --branch <branch>` - Branch, default: main
- `-f, --force` - Force overwrite
- `-d, --direction <direction>` - sync/push/pull, default: sync

**`team auth`**

- Set up GitHub authentication
- `-t, --token <token>` - GitHub Personal Access Token

**`team invite <email>`**

- Invite team member (placeholder - not implemented)
- `-r, --role <role>` - Role assignment, default: developer

**`team members`**

- List team members (shows repository info)

## Authentication Requirements

| Command    | Requires API Auth     | Notes                             |
| ---------- | --------------------- | --------------------------------- |
| `init`     | No                    | Sets up authentication            |
| `login`    | No                    | Manages authentication            |
| `dev`      | Yes                   | Registers webhooks via API        |
| `trigger`  | No                    | Local event simulation            |
| `config`   | No                    | Local configuration only          |
| `webhooks` | Yes                   | All webhook operations            |
| `payments` | Yes                   | All payment operations            |
| `gui`      | Yes                   | API operations for data           |
| `team`     | GitHub token for sync | Team features require GitHub auth |

## Command Dependencies

- **Config-dependent**: All commands except `init` require `.paymongo` config file
- **API-dependent**: Commands marked as requiring auth need valid PayMongo API keys
- **Network-dependent**: `dev`, `webhooks`, `gui` require internet for API calls
- **Interactive**: Most commands support both interactive and non-interactive modes

## Error Handling

All commands include:

- Configuration validation
- API error handling with actionable messages
- Graceful degradation for network issues
- Input validation with helpful error messages
- Cleanup operations (ngrok disconnect, webhook deletion)

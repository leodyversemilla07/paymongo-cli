# PayMongo CLI Roadmap

A clear path towards making PayMongo integration as simple as possible for developers.

---

## Project Phases Overview

The development of PayMongo CLI is structured into four main phases, focusing on core functionality, performance, observability, and extensibility.

| Phase       | Focus                         | Status       |
| ----------- | ----------------------------- | ------------ |
| **Phase 1** | **MVP & Core Workflow**       | Completed |
| **Phase 2** | **Performance & Simulation**  | Completed |
| **Phase 3** | **GUI & Advanced Analytics**  | Completed |
| **Phase 4** | **Plugin System & Ecosystem** | Planned   |

---

## Completed Phases

### Phase 1: MVP & Core Workflow

The foundation of the CLI is robust and ready for daily use.

#### Core Commands

- **Project Initialization (`paymongo init`)**
  - [x] Interactive setup wizard for new projects
  - [x] Non-interactive initialization via CLI flags (`--name`, `--env`, `--key`, etc.)
  - [x] Automatic project structure generation
- **Development Server (`paymongo dev`)**
  - [x] Automatic ngrok tunnel creation for local development
  - [x] Automatic webhook registration with PayMongo API
  - [x] Real-time webhook event logging in terminal
  - [x] Automatic cleanup of tunnels and webhooks on exit
- **Credential Management (`paymongo login`)**
  - [x] Secure API key storage using OS keychain (where available)
  - [x] Environment-specific credential management (test vs live)
  - [x] Secure logout and credential clearing
- **Webhook Management (`paymongo webhooks`)**
  - [x] List, create, show, and delete operations (Full CRUD)
  - [x] JSON output support for scripting
  - [x] Interactive and non-interactive creation flows
- **Configuration Management (`paymongo config`)**
  - [x] View and modify CLI settings
  - [x] Reset configuration to default values

#### Infrastructure & Security

- [x] API key validation before storage
- [x] Webhook signature verification (HMAC-SHA256)
- [x] Automatic `.gitignore` management for sensitive files

### Phase 2: Performance & Simulation

We have optimized the CLI for speed and added event simulation capabilities.

#### Performance Features

- **Lazy Loading**
  - [x] On-demand loading of heavy dependencies like `ngrok` and `inquirer`
  - [x] Result: ~30% faster CLI startup time
- **Intelligent Caching**
  - [x] Filesystem-based API response caching (2-minute TTL)
  - [x] In-memory configuration caching with auto-invalidation
  - [x] Result: Reduced API latency and faster repeated operations
- **Build & Development**
  - [x] Incremental TypeScript compilation
  - [x] Optimized production bundling

#### Payment Method Simulation

- **`paymongo payments confirm --simulate`**: Complete payment method simulation
  - [x] **GCash/Maya/GrabPay Support**: Mock all major Philippine payment methods
  - [x] **Realistic Delays**: Method-specific delays (GCash: 2-3s, Maya: 1-2s, GrabPay: 4-6s)
  - [x] **Outcome Simulation**: Success, failure, and timeout scenarios
  - [x] **Custom Delays**: Override default delays with `--delay` option
  - [x] **Validation**: Comprehensive input validation and error handling
  - [x] **User Feedback**: Clear simulation mode indicators and results

### Phase 3: GUI & Advanced Analytics

Enhanced observability and monitoring for PayMongo integrations.

#### GUI Features

- **Web Dashboard (`paymongo gui`)**
  - [x] Modern, responsive web interface
  - [x] Real-time webhook event monitoring via Socket.io
  - [x] ES module compatibility fix (`fileURLToPath` for `__dirname`)
- **Advanced Analytics**
  - [x] Event count tracking and success/failure rates
  - [x] Response time monitoring
  - [x] Comprehensive error tracking and logging
- **Configuration UI**
  - [x] Manage CLI settings directly from the browser
  - [x] Webhook status overview and toggle

#### Dev Server Enhancements

- **Background Mode (`paymongo dev --detach`)**
  - [x] Run dev server in detached/background mode
  - [x] `paymongo dev status` - Check server status
  - [x] `paymongo dev stop` - Stop background server
  - [x] `paymongo dev logs` - View server logs with `-f` follow option
- **Project-Specific Webhook Management**
  - [x] Webhooks tracked per-project with auto-cleanup on restart
  - [x] Automatic stale webhook cleanup from previous sessions
- **Improved Error Handling**
  - [x] Comprehensive HTTP response validation in trigger command
  - [x] Specific error messages for 404, 4xx, 5xx, connection refused, timeouts
  - [x] Clear dual-URL display (external vs local) for webhook forwarding

#### Team Collaboration Features

- **`paymongo team`**: Complete team collaboration framework with API key sharing
  - [x] **API Key Sharing**: Share PayMongo API keys securely with team members
  - [x] **Key Bundle Management**: Generate shareable key bundles for test/live environments
  - [x] **Member Tracking**: Track team members and which keys they've received
  - [x] **Import/Export**: Easy import of shared keys with member attribution
  - [x] **Team Management**: Rename teams, remove members, view team information

#### Bulk Operations

- **`paymongo payments export/import` & `paymongo webhooks export/import`**: Complete bulk data management
  - [x] **JSON Export/Import**: Export payments and webhooks to/from JSON files
  - [x] **Environment Migration**: Easy migration of configurations between test/live environments
  - [x] **Validation**: Comprehensive data validation during import operations
  - [x] **Progress Feedback**: Clear progress indicators for large bulk operations
  - [x] **Conflict Resolution**: Smart handling of duplicate data and conflicts

#### Rate Limiting Protection

- **Built-in API Abuse Prevention**: Comprehensive rate limiting system
  - [x] **Configurable Limits**: Different limits for test/live environments (100/min test, 50/min live)
  - [x] **Endpoint-Specific Rules**: Stricter limits for expensive operations (webhooks: 30/min, refunds: 20/min)
  - [x] **Automatic Backoff**: Exponential backoff with user feedback for rate limit hits
  - [x] **CLI Configuration**: `paymongo config rate-limit` commands for customization
  - [x] **Global Override**: `--no-rate-limit` flag for special cases

---

## Future Development

### Phase 4: Plugin System & Ecosystem (Planned)

The ultimate goal is to enable the community to extend the CLI through a modular plugin architecture.

#### Core Components

##### Plugin Manager (`src/services/plugins/manager.ts`)

- Plugin discovery and loading
- Plugin lifecycle management (install, enable, disable, uninstall)
- Dependency resolution and validation
- Plugin isolation and security

##### Plugin Interface (`src/types/plugin.ts`)

```typescript
export interface PayMongoPlugin {
  name: string;
  version: string;
  description: string;
  author: string;

  // Lifecycle hooks
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;

  // Plugin metadata
  commands?: Command[];
  services?: Service[];
  hooks?: PluginHook[];
}

export interface PluginHook {
  event: string;
  handler: (...args: any[]) => Promise<void> | void;
}
```

##### Plugin Registry (`src/services/plugins/registry.ts`)

- Maintain list of installed/enabled plugins
- Plugin metadata storage
- Version conflict resolution
- Plugin marketplace integration

#### Plugin Types

| Type                | Purpose                       | Example Use Case                                 |
| :------------------ | :---------------------------- | :----------------------------------------------- |
| **Command Plugins** | Add new CLI commands          | Custom webhook handlers, payment flow automation |
| **Service Plugins** | Integrate new services        | Database integrations, third-party APIs          |
| **Hook Plugins**    | Extend existing functionality | Enhanced logging, analytics tracking             |

#### Plugin Discovery and Loading

- **Local Plugins**: Stored in `.paymongo/plugins/` directory
- **NPM Packages**: Packages with `paymongo-plugin-` prefix
- **Git Repositories**: Plugins loaded from Git repos with plugin configuration

#### Security and Isolation

- **Sandboxing**: Plugin code runs in isolated context with limited Node.js API access
- **Permissions**: Declarative permission system for filesystem, network, and config access

#### Plugin API

Plugins can access core CLI services through dependency injection:

```typescript
export class MyPlugin implements PayMongoPlugin {
  constructor(
    private configManager: ConfigManager,
    private apiClient: ApiClient,
    private analyticsService: AnalyticsService
  ) {}

  onLoad() {
    const config = this.configManager.load();
    // ... plugin logic
  }
}
```

#### Example Plugin Structure

```
my-paymongo-plugin/
├── package.json
├── src/
│   ├── index.ts          # Main plugin class
│   ├── commands/         # CLI commands
│   ├── services/         # Services to register
│   └── hooks.ts          # Event hooks
├── README.md
└── paymongo-plugin.json  # Plugin metadata
```

#### Implementation Plan

| Phase   | Focus               | Deliverables                                                 |
| :------ | :------------------ | :----------------------------------------------------------- |
| **4.1** | Core Infrastructure | Plugin interfaces, plugin manager, `paymongo plugin` command |
| **4.2** | Plugin Development  | Plugin templates, documentation, example plugins             |
| **4.3** | Advanced Features   | Dependencies, version management, hot reloading              |

#### Benefits

- **Extensibility**: Add functionality without core changes
- **Modularity**: Clean separation of concerns
- **Community**: Enable third-party integrations
- **Maintenance**: Easier updates and bug fixes
- **Innovation**: Rapid prototyping of new features

> **Note**: The plugin system is opt-in and doesn't affect core CLI performance when no plugins are installed.

### Upcoming Goals

#### Mid-term Goals

- **Advanced Monitoring**: Enhanced analytics and performance monitoring

#### Long-term Goals

- **Automated Integration Testing**: Built-in tools for running E2E tests against PayMongo's test environment.
- **Subscription Support**: Payment link and subscription management when PayMongo API supports it.
- **Advanced Webhook Features**: Webhook filtering, transformation, and conditional routing.

---

## Contributing

We welcome contributions from the community! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and the pull request process.

---

## Relevant Documentation

- [Main README](README.md)
- [User Guide](USER_GUIDE.md)
- [PayMongo Developer Docs](https://developers.paymongo.com)

---

_Last Updated: January 25, 2026_

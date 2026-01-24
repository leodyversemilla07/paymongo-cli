# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-01-25

### Added

- **Rate Limiting Protection** - Comprehensive API abuse prevention with configurable limits:
  - Sliding window algorithm for accurate rate limiting
  - Environment-aware limits (100 req/min test, 50 req/min live)
  - Endpoint-specific limits for expensive operations (webhooks: 30/min, refunds: 20/min)
  - CLI configuration commands (`paymongo config rate-limit enable/disable/status/set-max-requests/set-window`)
  - Automatic exponential backoff for rate limit errors with user feedback
  - Global `--no-rate-limit` override flag for emergency bypass

### Changed

- **Bulk Operations** - Complete import/export functionality for payments and webhooks
- **Team Collaboration** - GitHub-based team configuration sync and member management
- **Enhanced Commands** - Improved CLI commands with better error handling and user experience

### Removed

- **Deprecated GitHub Services** - Removed outdated GitHub authentication and sync services

## [1.2.0] - 2026-01-24

### Added

- **Dev Server Background Mode** - Run dev server in detached mode with `paymongo dev --detach`:
  - `paymongo dev status` - Check if dev server is running in background
  - `paymongo dev stop` - Stop the background dev server
  - `paymongo dev logs` - View dev server logs with `-f` follow option
  - Process state management via DevProcessManager service
- **Project-Specific Webhook Paths** - Webhooks now use project slug in URL (`/webhook/{project-slug}`)
- **Automatic Webhook Cleanup** - Stale webhooks from previous sessions are cleaned up on dev start
- **Registered Webhook Tracking** - Track webhooks created by the CLI for proper cleanup

### Improved

- **Webhook Trigger Error Handling** - Enhanced error messages for webhook delivery failures:
  - Specific handling for HTTP 404, 4xx, and 5xx errors
  - Connection refused (ECONNREFUSED) guidance
  - Host not found (ENOTFOUND) troubleshooting
  - Timeout error handling with actionable suggestions
- **Dev Server Output** - Clearer display of external and local webhook URLs with forwarding info
- **Webhooks List** - Added helpful note for ngrok tunnel URLs

### Fixed

- **ES Module Compatibility** - Added `__dirname` compatibility for ES modules in web server
- **ESLint Warnings** - Resolved all 19 ESLint warnings

## [1.1.0] - 2026-01-24

### Added

- **Zod Schema Validation** - Runtime configuration validation with comprehensive error messages
- **Rate Limiting** - Express rate limiting for GUI API endpoints (100 req/min general, 20 req/min config writes)
- **New Unit Tests** - Added 11 new test files with comprehensive coverage for all services

### Changed

- **Async Cache Operations** - Converted all sync file operations to async for better performance
- **Updated Dependencies** - Major version updates for all packages:
  - commander: 11.1.0 → 14.0.2
  - cosmiconfig: 8.3.6 → 9.0.0
  - ora: 8.2.0 → 9.1.0
  - jest: 29.7.0 → 30.2.0
  - @types/node: 20.10.0 → 25.0.10
  - globals: 15.0.0 → 17.1.0

### Fixed

- **Type Safety** - Eliminated all `any` types throughout codebase (was 13+, now 0)
- **Error Handling** - Standardized error handling with custom error classes (ApiKeyError, PayMongoError, NetworkError)
- **CORS Security** - Restricted CORS to localhost origins only
- **Duplicate Handler** - Removed duplicate `unhandledRejection` handler in index.ts
- **Deprecated Imports** - Removed deprecated ZodIssue import, using native Zod 4.x types

### Security

- Added rate limiting to prevent API abuse
- Restricted CORS to localhost origins for GUI server
- Improved webhook signature verification

## [1.0.0] - 2026-01-24

### Added

- **CLI Commands**
  - `paymongo init` - Initialize PayMongo configuration in your project with interactive setup
  - `paymongo login` - Authenticate with PayMongo using API keys with secure credential storage
  - `paymongo dev` - Start local development server with webhook forwarding via ngrok tunnel
  - `paymongo gui` - Launch web-based dashboard for visual payment management
  - `paymongo config` - Manage CLI configuration (get, set, list, reset, export, import)
  - `paymongo payments` - Create and manage payments (create, list, retrieve, refund)
  - `paymongo webhooks` - Manage webhooks (create, list, delete, update, test)
  - `paymongo trigger` - Trigger test webhook events for local development
  - `paymongo team` - Team collaboration features (invite, list, remove members)

- **Core Features**
  - Secure API key management with local encrypted storage
  - Local webhook forwarding using ngrok integration
  - Real-time webhook event monitoring and logging
  - Support for both test and live environments
  - Configuration file support (`.paymongo.json`, `paymongo.config.js`)

- **Developer Experience**
  - Interactive prompts with inquirer for guided setup
  - Colorful terminal output with chalk
  - Loading spinners for async operations
  - Comprehensive error messages with troubleshooting hints
  - Input validation for API keys, amounts, and currencies

- **Web Dashboard (GUI)**
  - Visual interface for payment operations
  - Real-time webhook event viewer
  - Configuration management panel
  - Analytics and metrics display

- **GitHub Integration**
  - GitHub authentication support
  - Configuration sync across team members
  - Secure credential sharing for teams

- **Documentation**
  - Comprehensive README with quick start guide
  - Detailed USER_GUIDE.md with examples
  - API_REFERENCE.md for programmatic usage
  - INSTALLATION.md with platform-specific instructions
  - TROUBLESHOOTING.md for common issues
  - CONTRIBUTING.md for contributors

### Security

- Secure storage of API credentials in user home directory
- Support for environment variables for CI/CD pipelines
- No sensitive data logged to console or files

---

## Version History

| Version | Release Date | Highlights                                                           |
| ------- | ------------ | -------------------------------------------------------------------- |
| [1.2.0] | 2026-01-24   | Dev server background mode, improved error handling, webhook cleanup |
| [1.1.0] | 2026-01-24   | Type safety, Zod validation, rate limiting, dependency updates       |
| [1.0.0] | 2026-01-24   | Initial public release                                               |

---

## Upgrade Guide

### Upgrading to 1.2.0

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:** None. This is a backward-compatible release.

**New Features:**

- Run dev server in background with `--detach` flag
- New subcommands: `dev status`, `dev stop`, `dev logs`
- Automatic cleanup of stale webhooks
- Improved error messages for webhook triggers

### Upgrading to 1.1.0

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:** None. This is a backward-compatible release.

**New Features:**

- Runtime config validation with helpful error messages
- Rate limiting on GUI API endpoints

### Upgrading to 1.0.0

This is the initial release. To install:

```bash
npm install -g paymongo-cli
```

---

## Links

- [npm Package](https://www.npmjs.com/package/paymongo-cli)
- [GitHub Repository](https://github.com/leodyversemilla07/paymongo-cli)
- [Issue Tracker](https://github.com/leodyversemilla07/paymongo-cli/issues)
- [PayMongo API Documentation](https://developers.paymongo.com/)

[Unreleased]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/leodyversemilla07/paymongo-cli/releases/tag/v1.0.0

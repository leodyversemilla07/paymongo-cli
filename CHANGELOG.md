# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.9] - 2026-03-08

### Fixed

- **Release Workflow** - Made `.github/workflows/release.yml` idempotent by switching GitHub release creation to `softprops/action-gh-release`, preventing `already_exists` failures when a release for the tag already exists.
- **Release Pipeline** - Cut a follow-up patch release so tagged releases use the corrected workflow definition from the repository.

## [1.4.8] - 2026-03-08

### Changed

- **Command Modularization** - Refactored the large `config`, `payments`, `webhooks`, and `trigger` command files into focused helper/action modules to improve maintainability and make future changes safer.
- **Test Execution** - Reworked CLI entry/config integration tests to avoid subprocess spawning in restricted environments while preserving end-to-end behavior checks.
- **Documentation Alignment** - Updated README, installation, user guide, troubleshooting, testing, and contributor guidance to match the current Node 20+ runtime, `undici` network layer, ngrok token handling, and local team key-sharing workflow.

### Fixed

- **Config Validation Drift** - Added `rateLimiting` to the Zod configuration schema so runtime validation matches the declared config type and command behavior.
- **CLI Test Reliability** - Eliminated environment-specific `EPERM` failures in spawn-based tests by switching to sandbox-friendly execution patterns.
- **Release Metadata** - Synchronized package metadata by updating the npm package version and lockfile version fields to the current release line.

### Security

- **Webhook Verification Defaults** - New configs now enable webhook signature verification by default, and the dev server now rejects requests when verification is enabled but no webhook secret is configured.
- **Secret Messaging** - Clarified CLI messaging around webhook secret storage to describe the actual `.paymongo` storage location.

## [1.4.7] - 2026-02-27

### Changed

- **Error Handling** - Replaced all 60 `process.exit(1)` calls across 10 command files with a `CommandError` throw pattern and centralized global error handler in `index.ts`.
- **CLI Version** - Version string is now dynamically read from `package.json` instead of being hardcoded, keeping User-Agent headers and `--version` output always in sync.
- **Magic Numbers** - Extracted hardcoded cache TTL, rate limit thresholds, and API base URL into named constants in `constants.ts`.
- **Async File I/O** - Converted synchronous `fs` operations to `fs/promises` in dev-mode hot paths:
  - `webhook-store.ts`: Lazy async directory creation, all read/write operations non-blocking.
  - `analytics/service.ts`: Async persistence with `_ready` promise to prevent constructor race conditions.
  - `process-manager.ts`: All static methods async; updated 13 call sites across dev subcommands.
- **Deduplicated ValidationError** - Removed duplicate `ValidationError` class from `validator.ts`; single definition now lives in `errors.ts` and is re-exported.
- **DevServer Logging** - Replaced raw `console.log`/`console.error` calls in `DevServer` with structured `Logger` instance for consistent, controllable output.

### Fixed

- **Input Sanitization** - Enhanced `validateWebhookUrl()` with max URL length (2048 chars), automatic whitespace trimming, and rejection of URLs containing embedded credentials.
- **Race Condition** - Fixed analytics service race where `loadEvents()` could overwrite in-memory state written by `recordEvent()` before async load completed.
- **Unhandled Promises** - `recordEvent()` calls in `DevServer` are now properly awaited via extracted `processWebhookBody()` method, preventing silent failures.
- **Bulk Import Errors** - `importWebhooks()` and `importPayments()` now catch file-not-found and malformed JSON errors, throwing descriptive `PayMongoError` instead of raw stack traces.

### Added

- **Unit Tests** - Added 62 new tests across 3 previously-uncovered modules:
  - `BulkOperations` (19 tests): export/import, file errors, JSON validation, filename generation.
  - `DevProcessManager` (22 tests): state persistence, process detection, log management, uptime formatting.
  - `TeamService` (21 tests): key bundles, member management, serialization, team operations.

### Security

- Webhook URL validation now blocks URLs with embedded `user:pass@` credentials to prevent credential leakage.

## [1.4.6] - 2026-02-03

### Changed

- **Config Validation** - Allowed loading configs without API keys and normalized optional fields to avoid setup lockouts.
- **Webhook Signatures** - Standardized signature verification format across dev server, trigger, and generated templates.
- **CLI Startup** - Lazy-loaded prompt dependencies in several commands for faster startup.

### Fixed

- **Analytics Persistence** - Stored analytics in a safe user directory with test override support.
- **Dev Auto-Register** - Respected `dev.autoRegisterWebhook` in the dev command.
- **Team Import** - Enabled `--force` to overwrite existing keys during team import.
- **Config Import** - Validated imports with schema and normalized missing optional fields.

## [1.4.5] - 2026-02-01

### Changed

- **Credential Encryption** - Migrated stored credentials to AES-256-GCM with scrypt-derived keys and per-machine salt, with automatic legacy AES-256-CBC migration on load.
- **Init .gitignore Handling** - Made `.env` and `.paymongo` ignore entries idempotent and appended with a consistent header when missing.

### Fixed

- **API Key Errors** - Standardized missing secret key handling to throw `ApiKeyError` in the API client.
- **Test Reliability** - Updated login and template tests for new encryption payloads and added DevServer webhook signature verification coverage.

## [1.4.4] - 2026-01-27

### Changed

- **Codebase Modularization** - Refactored large command files into modular components for better maintainability:
  - `dev.ts`: Extracted `DevServer` class and subcommands (`status`, `stop`, `logs`) into separate files.
  - `generate.ts`: Extracted code generation templates into modular template files organized by type and language.
  - Reduced main command file sizes significantly (`dev.ts`: 735 -> ~330 lines, `generate.ts`: 1261 -> ~250 lines).

- **Integration Testing** - Expanded integration test coverage:
  - Added `dev-server.test.ts` for DevServer lifecycle and process management.
  - Added `generate-templates.test.ts` for comprehensive template generation verification.
  - Achieved pass on all 387 tests across 25 test suites.

### Fixed

- **Type Safety** - Resolved TypeScript errors in integration tests by adding proper type definitions for mock objects.

## [1.4.3] - 2026-01-26

### Added

- **Enhanced Error Handling** - Improved error messages in `init`, `login`, and `env` commands with specific error types:
  - `ApiKeyError`: Invalid or unauthorized API keys
  - `NetworkError`: Connection and timeout issues
  - `PayMongoError`: API-specific errors with status codes
  - Actionable error messages with troubleshooting guidance

### Changed

- **Test Output Cleanup** - Suppressed verbose console output and Node.js warnings in test runs:
  - Added `silent: true` to Jest configuration to hide CLI command output
  - Added `NODE_NO_WARNINGS=1` to test scripts to suppress experimental VM warnings
  - Cleaner test output focused on results rather than implementation details

- **API Client Consolidation** - Merged `UndiciClient` into main `ApiClient` class:
  - Removed separate `undici-client.ts` file
  - Updated all imports and tests to use unified `ApiClient`
  - Maintained all existing functionality (caching, rate limiting, error handling)

### Removed

- **E2E Test Suite** - Removed `tests/e2e/` folder and associated files:
  - Deleted `tests/e2e/login.test.ts` and `tests/e2e/README.md`
  - Removed e2e references from documentation (`CONTRIBUTING.md`, `AGENTS.md`, `.github/copilot-instructions.md`)
  - Unit tests provide equivalent coverage without requiring real API credentials

### Fixed

- **Test Compatibility** - Updated test mocks to work with new error handling:
  - Changed `validateApiKey()` from boolean return to void (throws on error)
  - Updated test expectations for error throwing instead of boolean returns
  - Maintained test coverage while improving error handling consistency

## [1.4.1] - 2026-01-26

### Added

- **Comprehensive Test Coverage** - Added 380 unit tests across 23 test suites:
  - Complete test coverage for 8 CLI command files (init, config, login, dev, payments, env, trigger, webhooks)
  - 100% coverage for each tested command with comprehensive error handling and edge cases
  - Established testing patterns for Commander.js commands with ESM module mocking
  - Mock implementations for all external dependencies (axios, ngrok, filesystem operations)

### Fixed

- **ESLint Compliance** - Resolved all 44 ESLint warnings across the codebase
- **Type Safety** - Enhanced type annotations and eliminated type-related warnings

### Changed

- **Documentation Updates** - Updated TESTING.md with current test coverage status and completed work sections
- **Git Configuration** - Updated .gitignore to exclude test output and coverage files

## [1.4.0] - 2026-01-26

### Added

- **Code Generation Command** - New `paymongo generate` command with comprehensive boilerplate generation:
  - `webhook-handler` subcommand: Generate webhook handlers for specific events (payment.paid, payment.failed, etc.)
  - `payment-intent` subcommand: Generate payment intent creation code with multiple payment methods
  - `checkout-page` subcommand: Generate checkout pages in HTML, React, or Vue with PayMongo integration
  - Support for multiple languages (JavaScript, TypeScript) and frameworks (Express, Fastify, Hapi)
  - Interactive prompts for configuration and file naming
  - Comprehensive help text and examples for all subcommands

- **Analytics Configuration** - Added analytics opt-in configuration to PayMongo config schema:
  - `analytics.enabled` boolean flag for webhook event tracking
  - Enhanced analytics service with proper configuration validation
  - Analytics tests with enabled/disabled state handling

### Changed

- **HTTP Client Migration** - Complete migration from Axios to Undici for improved performance:
  - New `UndiciClient` class using Node.js built-in `undici` library
  - Better error handling with custom error classes (NetworkError, ApiKeyError, PayMongoError)
  - Maintained caching and rate limiting functionality
  - Improved timeout and retry logic with exponential backoff

- **Logger Simplification** - Replaced Winston with custom console-based logger:
  - Removed heavy Winston dependency for faster CLI startup (<100ms target)
  - Custom logger with chalk colors and structured output
  - Maintained all logging levels (error, warn, info, debug) and meta data support
  - Convenience methods for success/failure/warning messages

- **TypeScript Configuration Optimization** - CLI-specific performance optimizations:
  - Disabled source maps and declarations for faster builds
  - Added `removeComments` and `importHelpers: false` for smaller bundles
  - Maintained strict type checking while optimizing for CLI usage

### Removed

- **Web Dashboard (GUI)** - Complete removal of web-based interface:
  - Deleted `web/index.html` dashboard file
  - Removed GUI command and related tests
  - CLI now focuses exclusively on terminal-based operations
  - Simplified architecture by removing Express/Socket.io dependencies

### Fixed

- **Type Safety Improvements** - Enhanced literal type assertions throughout codebase:
  - Added `'webhook' as const` and `'enabled' as const` type assertions
  - Improved webhook command test type safety
  - Better TypeScript compliance with strict mode settings

### Performance

- **Startup Time Optimization** - Reduced CLI startup time through dependency reduction:
  - Removed Winston logger dependency
  - Eliminated web dashboard assets and dependencies
  - Optimized TypeScript compilation settings
  - Maintained <100ms startup time target

- **HTTP Performance** - Undici client provides better performance than Axios:
  - Native Node.js HTTP/2 support
  - Improved connection pooling and keep-alive handling
  - Better memory usage for concurrent requests

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
| [1.4.7] | 2026-02-27   | CommandError pattern, dynamic version, async FS, input sanitization  |
| [1.4.6] | 2026-02-03   | Config validation, webhook signatures, lazy loading                  |
| [1.4.5] | 2026-02-01   | AES-256-GCM encryption, .gitignore handling                          |
| [1.4.4] | 2026-01-27   | Codebase modularization, integration testing                         |
| [1.4.3] | 2026-01-26   | Enhanced error handling, test output cleanup, API client consolidation |
| [1.4.1] | 2026-01-26   | Test coverage completion, ESLint compliance, documentation updates   |
| [1.4.0] | 2026-01-26   | Code generation, HTTP client migration, GUI removal, performance optimization |
| [1.3.0] | 2026-01-25   | Rate limiting protection, bulk operations, team collaboration        |
| [1.2.0] | 2026-01-24   | Dev server background mode, improved error handling, webhook cleanup |
| [1.1.0] | 2026-01-24   | Type safety, Zod validation, rate limiting, dependency updates       |
| [1.0.0] | 2026-01-24   | Initial public release                                               |

---

## Upgrade Guide
### Upgrading to 1.4.7

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:** None. This is a backward-compatible patch release.

**Improvements:**
- All `process.exit(1)` calls replaced with structured error handling — CLI now exits cleanly through global error handlers
- Sync file I/O in dev-mode hot paths converted to async for better event loop performance
- Webhook URL validation hardened against credential leakage and oversized inputs
- CLI version always matches `package.json` — no more stale User-Agent strings
- Duplicate `ValidationError` class consolidated to single definition
- DevServer uses structured Logger instead of raw console output
- Bulk import operations now produce user-friendly error messages
- 62 new unit tests covering BulkOperations, DevProcessManager, and TeamService

### Upgrading to 1.4.3

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:** None. This is a backward-compatible patch release.

**New Features:**
- Enhanced error handling with specific error types and actionable messages
- Cleaner test output with suppressed console logs and warnings
- Consolidated API client implementation

### Upgrading to 1.4.1

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:** None. This is a backward-compatible patch release.

**New Features:**
- Comprehensive test coverage (380 unit tests across 23 test suites)
- Full ESLint compliance (resolved all 44 warnings)
- Enhanced documentation and testing guides

### Upgrading to 1.4.0

```bash
npm install -g paymongo-cli@latest
```

**Breaking Changes:**
- Web dashboard (GUI) has been completely removed. Use terminal commands instead.
- Winston logger dependency removed. Internal logging API may have changed.

**New Features:**
- Code generation with `paymongo generate` command
- Improved HTTP performance with Undici client
- Faster CLI startup time
- Analytics configuration support

**Migration Notes:**
- If you were using the web GUI, migrate to using terminal commands
- No action needed for existing webhook or payment operations
- All existing CLI commands remain functional
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

[Unreleased]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.7...HEAD
[1.4.7]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.6...v1.4.7
[1.4.6]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.5...v1.4.6
[1.4.5]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.4...v1.4.5
[1.4.4]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.1...v1.4.3
[1.4.1]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/leodyversemilla07/paymongo-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/leodyversemilla07/paymongo-cli/releases/tag/v1.0.0

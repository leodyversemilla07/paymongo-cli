# PayMongo CLI - Agent Guidelines

## Project Overview

PayMongo CLI is a developer-first command-line tool for PayMongo payment integration with local webhook forwarding. It uses **ESM modules** with Commander.js for CLI commands and provides a terminal-first interface.

**Tech Stack**: TypeScript, Node.js 20+, Commander.js, built-in `http`, `undici`, ngrok, Zod, Vitest

---

## Build & Development Commands

### Primary Commands

```bash
npm run build              # Compile TypeScript to dist/
npm run dev                # Watch mode compilation
npm start                  # Run compiled CLI
npm link                   # Test CLI globally during development
```

### Quality Assurance

```bash
npm run lint               # Biome check
npm run lint:fix           # Auto-fix lint issues with Biome
npm run format             # Biome formatting
npm run test               # Run all tests
npm run test:watch         # Vitest watch mode
npm run benchmark          # Performance benchmarking
```

### Testing Specific Files

```bash
# Run single test file
npm run test -- tests/unit/errors.test.ts
npm run test -- tests/integration/config-commands.test.ts

# Run tests matching pattern
npm run test -- --testNamePattern="retry"

# Run tests for specific directory
npm run test -- tests/unit/
```

---

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022 with NodeNext modules
- **Strict mode**: Enabled with all strict checks
- **Module resolution**: NodeNext (ESM)
- **Imports**: Use `.js` extension for local imports (required for ESM)
- **Declarations**: Currently disabled in `tsconfig.json` for build output

### Import/Export Patterns

```typescript
// ✓ Correct: ESM with .js extensions
import ConfigManager from '../services/config/manager.js';
import { PayMongoError } from '../utils/errors.js';

// ✗ Wrong: Missing .js extension
import ConfigManager from '../services/config/manager';
```

### Error Handling

Always use custom error classes from `src/utils/errors.ts`:

```typescript
import { PayMongoError, NetworkError, ConfigError, ApiKeyError } from '../utils/errors.js';

try {
  // operation
} catch (error) {
  throw new PayMongoError('User-friendly message', 'ERROR_CODE', 400);
}
```

### Retry Logic

Use `withRetry()` for network operations:

```typescript
import { withRetry } from '../utils/errors.js';

const result = await withRetry(() => apiCall(), { maxRetries: 3, delayMs: 1000, silent: true });
```

### Lazy Loading

Import heavy dependencies inside functions to keep CLI startup fast (<100ms):

```typescript
// ✓ Correct: Lazy load @inquirer/prompts
.action(async () => {
  const { confirm } = await import('@inquirer/prompts');
  // use confirm
});

// ✗ Wrong: Top-level import slows startup
import { confirm } from '@inquirer/prompts';
```

### Naming Conventions

- **Files**: kebab-case (`config-manager.ts`, `api-client.ts`)
- **Classes**: PascalCase (`ApiClient`, `ConfigManager`)
- **Functions/Methods**: camelCase (`validateApiKey()`, `createWebhook()`)
- **Constants**: SCREAMING_SNAKE_CASE (`REQUEST_TIMEOUT`)
- **Interfaces**: PascalCase with `I` prefix (`IPayMongoConfig`)
- **Types**: PascalCase (`PayMongoConfig`, `ApiResponse<T>`)

### Type Safety

- **No `any`**: Use proper types from `src/types/paymongo.ts`
- **Optional properties**: Use `?:` instead of `| undefined`
- **Exact types**: Enable `exactOptionalPropertyTypes`
- **Indexed access**: Enable `noUncheckedIndexedAccess`
- **Non-null assertions**: Warn on `@typescript-eslint/no-non-null-assertion`

### Code Structure

```
src/
├── commands/          # CLI commands (one file per command)
│   ├── init.ts       # paymongo init
│   ├── dev.ts        # paymongo dev
│   └── ...
├── services/         # Business logic
│   ├── api/         # PayMongo API client
│   ├── config/      # Configuration management
│   ├── dev/         # Local dev server + process management
│   ├── analytics/   # Local webhook analytics
│   ├── payments/    # Payment simulation helpers
│   └── team/        # Team key-sharing workflows
├── types/           # TypeScript definitions + Zod schemas
├── utils/           # Shared utilities
└── index.ts         # CLI entry point
```

### Async/Await Patterns

- **Always async**: Use `async/await` over Promises
- **Error propagation**: Let errors bubble up, handle at command level
- **Cleanup**: Use try/finally for resource cleanup

### Validation

Use Zod schemas from `src/types/schemas.ts`:

```typescript
import { validateConfig } from '../types/schemas.js';

const config = validateConfig(input);
```

---

## Testing Guidelines

### Test Structure

```
tests/
├── unit/             # Unit tests (single functions/classes)
├── integration/      # Integration tests (command end-to-end)
```

### Mocking ESM Modules

Use `jest.unstable_mockModule()` before dynamic imports:

```typescript
jest.unstable_mockModule('undici', () => ({
  request: mockRequest,
}));

const { ApiClient } = await import('../../src/services/api/client.js');
```

### Test Patterns

- **Imports**: Use `@jest/globals` explicitly
- **Setup/Teardown**: Use `beforeEach`/`afterEach`
- **Fake timers**: Use `jest.useFakeTimers()` for time-dependent code
- **Console suppression**: Mock `console.log` during tests
- **Async tests**: Use `async/await` with `jest.advanceTimersByTimeAsync()`

### Coverage Requirements

- **Statements**: >80%
- **Branches**: >75%
- **Functions**: >85%
- **Lines**: >80%

---

## Commit Guidelines

### Conventional Commits

```
feat: add payment intent creation command
fix: handle network timeouts in webhook forwarding
docs: update installation guide for Windows
test: add integration tests for config commands
refactor: extract webhook validation to separate module
```

### Atomic Commits

- **One logical change** per commit
- **Test with changes** when possible
- **Update docs** if behavior changes
- **Reference issues** in commit messages

### Commit Content

- **First line**: <50 chars, imperative mood
- **Body**: Explain what and why (not how)
- **Footer**: Breaking changes, issue references

---

## Pull Request Process

### PR Template

Use the provided `.github/PULL_REQUEST_TEMPLATE.md` which includes:

- Description of changes
- Testing instructions
- Screenshots (if UI changes)
- Breaking changes notice

### Review Checklist

- [ ] **Tests pass**: `npm test`
- [ ] **Lint clean**: `npm run lint`
- [ ] **Type check**: `npm run build`
- [ ] **Documentation updated**: README, API docs
- [ ] **Breaking changes documented**: If any

### Code Review Focus

- **Type safety**: No `any`, proper error handling
- **Performance**: Lazy loading, efficient algorithms
- **Security**: No credential logging, proper validation
- **Testing**: Adequate coverage, proper mocking
- **Architecture**: Follows established patterns

---

## Security Guidelines

### API Keys & Credentials

- **Never log**: API keys, secrets, or sensitive data
- **Encryption**: Use `ConfigManager` for credential storage
- **Validation**: Validate keys on input, not in logs
- **Environment**: Separate test/live environments clearly

### Network Security

- **Timeouts**: 30-second default for API calls
- **Retries**: Exponential backoff with jitter
- **Headers**: Proper User-Agent, Content-Type
- **HTTPS**: All external requests use HTTPS

### File System Security

- **Permissions**: Check write permissions before operations
- **Paths**: Validate and sanitize file paths
- **Sensitive files**: Add to `.gitignore` (.env, .paymongo)

---

## Performance Guidelines

### Startup Time

- **Target**: <100ms CLI startup
- **Lazy loading**: Heavy imports inside command actions
- **Minimal bundle**: Only essential code in main entry

### Memory Usage

- **Caching**: 2-minute TTL for API responses
- **Cleanup**: Proper resource cleanup in finally blocks
- **Streaming**: Use streams for large data processing

### Network Efficiency

- **Timeouts**: Reasonable timeouts (30s default)
- **Retries**: Smart retry logic (network errors only)
- **Caching**: Cache GET requests when appropriate

---

## Documentation Standards

### Code Comments

- **Functions**: JSDoc for public APIs
- **Complex logic**: Explain why, not what
- **TODOs**: Use `// TODO: description` format

### README Updates

- **Commands**: Update when adding new commands
- **Examples**: Provide working examples
- **Troubleshooting**: Add common issues/solutions

### API Documentation

- **Types**: Export all public interfaces
- **Examples**: Include usage examples in JSDoc
- **Breaking changes**: Document in changelog

---

## Tooling & Editor Setup

### VS Code Extensions

- TypeScript and JavaScript Language Features
- Biome
- Vitest

### EditorConfig

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{ts,js,json,md}]
indent_style = space
indent_size = 2
```

### Git Hooks

- **pre-commit**: Run lint and tests
- **pre-push**: Run full test suite
- **commit-msg**: Validate conventional commit format

---

## Deployment & Release

### Version Management

- **Semantic versioning**: MAJOR.MINOR.PATCH
- **Breaking changes**: Increment MAJOR
- **New features**: Increment MINOR
- **Bug fixes**: Increment PATCH

### Release Process

1. **Update version** in `package.json`
2. **Update CHANGELOG.md**
3. **Create git tag**: `git tag v1.2.0`
4. **Push tag**: Triggers GitHub Actions release
5. **Publish to npm**: Automatic via workflow

### NPM Publishing

- **Public access**: `npm publish --access public`
- **GitHub Packages**: Scoped `@leodyversemilla07/paymongo-cli`
- **Pre-releases**: Use `--tag beta` for beta releases

---

## GitHub Copilot Instructions

See `.github/copilot-instructions.md` for AI agent guidelines specific to this codebase.

---

## Troubleshooting

### Common Issues

- **ESM imports failing**: Ensure `.js` extensions in imports
- **TypeScript compilation errors**: Run `npm run build` to check
- **Test failures**: Check mocking setup for ESM modules
- **CLI not found**: Run `npm link` for local development

### Debug Mode

```bash
# Enable debug logging
DEBUG=paymongo:* npm run dev

# Verbose test output
npm run test -- --verbose
```

### Getting Help

1. **Check existing issues** on GitHub
2. **Run diagnostics**: `npm run lint && npm test`
3. **Check logs**: Enable debug logging
4. **Create issue** with reproduction steps

---

_This document is maintained by the PayMongo CLI development team. Last updated: 2024_

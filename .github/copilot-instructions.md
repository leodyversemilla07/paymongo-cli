# PayMongo CLI - AI Agent Instructions

## Project Overview
PayMongo CLI is a TypeScript-based developer tool for PayMongo payment integration with local webhook forwarding via ngrok tunneling. It uses **ESM modules** (`"type": "module"`) with Commander.js for CLI commands.

## Architecture

### Code Structure
```
src/
├── commands/      # CLI commands (commander.js) - one file per top-level command
├── services/      # Core business logic
│   ├── api/       # ApiClient - PayMongo V1 API wrapper with retries & caching
│   ├── config/    # ConfigManager - .paymongo file handling via cosmiconfig
│   └── web/       # Express + Socket.io for GUI dashboard
├── types/         # TypeScript definitions + Zod schemas
└── utils/         # Shared utilities (errors, logging, cache, validation)
```

### Key Patterns

**Error Handling** - Always use custom error classes from `src/utils/errors.ts`:
```typescript
import { PayMongoError, NetworkError, ConfigError, ApiKeyError } from '../utils/errors.js';
throw new PayMongoError('User-friendly message', 'ERROR_CODE', 400);
```

**Retry Logic** - Use `withRetry()` for network operations:
```typescript
import { withRetry } from '../utils/errors.js';
const result = await withRetry(() => apiCall(), { maxRetries: 3, silent: true });
```

**Lazy Loading** - Import heavy dependencies inside functions to keep CLI startup fast (<100ms):
```typescript
// ✓ Correct - lazy load inside action
.action(async () => {
  const { confirm } = await import('@inquirer/prompts');
});
// ✗ Wrong - top-level import slows startup
import { confirm } from '@inquirer/prompts';
```

**ESM Imports** - Always use `.js` extension for local imports:
```typescript
import ConfigManager from '../services/config/manager.js';
```

## Configuration
- Project config: `.paymongo` (JSON, managed via `ConfigManager`)
- Global credentials: `~/.paymongo/credentials.enc` (AES-256-CBC encrypted)
- Validation: Zod schemas in `src/types/schemas.ts`

## Development Workflow

### Commands
```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode compilation
npm link               # Test CLI globally as 'paymongo'
npm test               # Jest with ESM (--experimental-vm-modules)
npm run lint:fix       # ESLint auto-fix
```

### Testing Strategy
- **Mocking ESM**: Use `jest.unstable_mockModule()` before dynamic imports
- Structure: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Mock external services (axios, ngrok, filesystem)

Example test pattern:
```typescript
jest.unstable_mockModule('axios', () => ({ default: mockAxios }));
const { ApiClient } = await import('../../src/services/api/client.js');
```

## Code Conventions

### TypeScript
- Strict mode enabled with `noImplicitAny`, `noUncheckedIndexedAccess`
- Avoid `any` - use proper types from `src/types/paymongo.ts`
- Config validation via Zod: `validateConfig()` from `src/types/schemas.ts`

### Commit Messages
Follow conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`

### Security
- Never log API keys or sensitive data
- Use `ConfigManager` for credential access
- Keep `.paymongo` and `.env` in `.gitignore`

## Key Files Reference
- [src/services/api/client.ts](src/services/api/client.ts) - API wrapper with interceptors
- [src/utils/errors.ts](src/utils/errors.ts) - Error classes + `withRetry()`
- [src/types/schemas.ts](src/types/schemas.ts) - Zod validation schemas
- [src/services/config/manager.ts](src/services/config/manager.ts) - Config file handling

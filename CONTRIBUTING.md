# Contributing to PayMongo CLI

Thank you for your interest in contributing to the PayMongo CLI! This project is built by and for Filipino developers to streamline payment integration. By contributing, you're helping the local fintech ecosystem grow.

This guide provides everything you need to know to get started with local development and the contribution process.

---

## Development Setup

### 1. Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.0.0 or higher (Check with `node -v`)
- **npm**: v9.0.0 or higher
- **Git**: For version control
- **ngrok account**: Required for testing webhook forwarding features (Free tier is sufficient)

### 2. Local Development

Follow these steps to set up your development environment:

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/paymongo-cli.git
    cd paymongo-cli
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Build the project**:
    ```bash
    npm run build
    ```
5.  **Run in watch mode** (Recommended during development):
    ```bash
    npm run dev
    ```
6.  **Link for local testing**:
    ```bash
    npm link
    ```
    Now you can run the `paymongo` command globally, and it will point to your local build.

### 3. Testing

We maintain high test coverage to ensure reliability.

- **Run all tests**: `npm test`
- **Watch mode**: `npm run test:watch`
- **Test Structure**:
  - `tests/unit`: Logic and utility tests.
  - `tests/integration`: API and service interaction tests.
  - `tests/e2e`: Full command-line execution tests.

### 4. Code Quality

We use ESLint and Prettier to maintain a consistent code style.

- **Linting**: `npm run lint` (or `npm run lint:fix` to auto-fix)
- **Formatting**: `npm run format` (uses Prettier)

---

## Contribution Workflow

### 1. Issue Creation

Before starting work, please [open an issue](https://github.com/leodyversemilla07/paymongo-cli/issues) or comment on an existing one to discuss your proposed changes. This helps prevent duplicated effort.

### 2. Fork & Branch

- Create a feature branch from `main`:
  ```bash
  git checkout -b feature/your-awesome-feature
  ```
- Keep your commits small and focused.

### 3. Code Standards

- **TypeScript**: Use strict typing and avoid `any` wherever possible.
- **Naming**: Use camelCase for variables/functions and PascalCase for classes/interfaces.
- **Commit Messages**: Follow the conventional commits style (e.g., `feat: add payment refund support`, `fix: handle 500 errors gracefully`).

### 4. Pull Request Process

1.  Push your changes to your fork.
2.  Open a Pull Request (PR) against the `main` branch.
3.  Ensure the PR description clearly explains **what** changed and **why**.
4.  Wait for review. At least one maintainer must approve your PR before merging.

---

## 🏗 Project Architecture

### 1. Code Structure

```text
paymongo-cli/
├── bin/                # CLI Entry points
├── src/
│   ├── commands/       # Commander.js command implementations
│   ├── services/       # Core business logic (API, Config, GitHub)
│   ├── utils/          # Shared utilities (Errors, Logging, Validators)
│   ├── types/          # TypeScript definitions
│   └── index.ts        # CLI Application initialization
└── tests/              # Test suites (Unit, Integration, E2E)
```

### 2. Key Components

- **Commands**: Each file in `src/commands` corresponds to a top-level CLI command.
- **Services**:
  - `ApiClient`: Wrapper for PayMongo V1 API with built-in retries and caching.
  - `ConfigManager`: Handles `.paymongo` project configuration using `cosmiconfig`.
- **Utilities**:
  - `Logger`: Lightweight console-based logging with `chalk` formatting.
  - `withRetry`: Exponential backoff utility for resilient networking.

### 3. API Integration

The CLI uses a custom `ApiClient` built on `axios`. It automatically handles:

- **Basic Auth**: Using your Secret Key.
- **Retries**: Automatic 3-retry mechanism for 5xx and network errors.
- **Caching**: 2-minute TTL for list operations to reduce API load.

---

## Development Guidelines

### 1. Error Handling

Always use the custom error classes in `src/utils/errors.ts`:

```typescript
import { PayMongoError, NetworkError } from '../utils/errors';

try {
  // operation
} catch (error) {
  throw new PayMongoError('User-friendly message', 'ERROR_CODE', 400);
}
```

### 2. Security

- **Credentials**: Sensitive data like API keys should **never** be logged or hardcoded.
- **Encryption**: Global credentials are stored at `~/.paymongo/credentials.enc` using AES-256-CBC. Use the `CredentialsManager` service for access.
- **Git**: Ensure `.paymongo` and `.env` remain in `.gitignore`.

### 3. Performance

- **Lazy Loading**: Import heavy dependencies (like `ngrok` or `inquirer`) only inside the function where they are used to keep CLI startup time under 100ms.
- **Caching**: Use the `Cache` utility for repeated API calls.

### 4. Testing Strategy

- **Mocking**: Use `jest.mock()` for API calls and external services.
- **Assertions**: Verify not just success paths, but also how the CLI handles invalid inputs and network failures.

---

## Release Process

### 1. Versioning

We follow [Semantic Versioning (SemVer)](https://semver.org/):

- `MAJOR`: Breaking changes.
- `MINOR`: New features (backward compatible).
- `PATCH`: Bug fixes (backward compatible).

### 2. Changelog

Maintain the `CHANGELOG.md` (if present) or provide a detailed release summary in the GitHub Release notes.

---

## 🤝 Community Guidelines

### 1. Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in your communications.

### 2. Communication

- **Bugs/Features**: Use GitHub Issues.
- **Discussions**: Use GitHub Discussions for questions and brainstorming.

### 3. Recognition

All contributors who have their PRs merged will be listed in our `CONTRIBUTORS` list. We appreciate your time and expertise!

---

## Built for the Philippines

PayMongo CLI is a labor of love for the Filipino dev community. Thank you for making it better!

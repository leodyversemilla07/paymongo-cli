# E2E Testing with API Keys

This directory contains end-to-end tests that validate the PayMongo CLI login functionality.

## Security Notice

**Never commit API keys to version control.** The test file uses environment variables to avoid exposing sensitive credentials.

## Running Tests

To run the E2E tests, you need to provide API keys via environment variables:

```bash
# Set test environment API keys
export PAYMONGO_TEST_SECRET_KEY="sk_test_your_test_secret_key"
export PAYMONGO_TEST_PUBLIC_KEY="pk_test_your_test_public_key"

# Set live environment API keys (optional, for production testing)
export PAYMONGO_LIVE_SECRET_KEY="sk_live_your_live_secret_key"
export PAYMONGO_LIVE_PUBLIC_KEY="pk_live_your_live_public_key"

# Run the tests
npm test -- tests/e2e/login.test.ts
```

## Test Coverage

The E2E tests validate:

- ✅ API key validation against PayMongo servers
- ✅ Credential encryption and storage
- ✅ Login/logout functionality
- ✅ Environment switching (test/live)
- ✅ Error handling for invalid keys
- ✅ Subsequent API calls after authentication

## Test Structure

- `login.test.ts`: Main E2E test suite for login functionality
- Tests are automatically skipped if required environment variables are not set
- Tests make real API calls to PayMongo (requires valid API keys)

## Manual Testing

For manual testing without environment variables:

```bash
# Test environment
paymongo login --key sk_test_your_key --public-key pk_test_your_key --env test

# Live environment
paymongo login --key sk_live_your_key --public-key pk_live_your_key --env live

# Verify functionality
paymongo webhooks list
paymongo login --logout
```

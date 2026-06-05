# PayMongo CLI vs API Alignment Analysis

## Executive Summary

- **PayMongo API Resources**: 131+ unique resources across 20+ categories
- **CLI Implemented Resources**: 7 API resource types (webhooks, payments, payment_intents, payment_methods, payment_links, sources, refunds)
- **Coverage**: ~5.3% of PayMongo's documented API surface

---

## PayMongo API Resources (from public docs)

### ✅ IMPLEMENTED IN CLI

| Resource | CLI Command | API Endpoints | Status |
|----------|-------------|--------------|--------|
| **Payment Intents** | `paymongo intents` | POST/GET/CANCEL `/v1/payment_intents` | ✅ Full |
| **Payments** | `paymongo payments` | GET `/v1/payments` | ✅ Partial |
| **Payment Methods** | (via intents) | POST/GET `/v1/payment_methods` | ✅ Partial |
| **Sources** | `paymongo sources` | POST/GET `/v1/sources` | ✅ Basic |
| **Payment Links** | `paymongo payment-links` | POST/GET/LIST `/v1/payment_links` | ✅ Basic |
| **Webhooks** | `paymongo webhooks` | CREATE/LIST/GET/UPDATE/DISABLE/ENABLE/DELETE | ✅ Full |
| **Refunds** | (via payments) | POST/GET `/v1/refunds` | ✅ Partial |

### ❌ NOT IMPLEMENTED IN CLI

#### Subscriptions & Recurring Payments
- `/v1/subscriptions` - Create, list, cancel, retrieve, change plan, change payment method, on-demand payments
- `/v1/plans` - Create, list, update, retrieve plans
- Invoicing: `/v1/invoices`, `/v1/invoice_line_items`

#### Programmable Cards (Issuing)
- `/v1/cardholders` - Create, list, retrieve cardholders
- `/v1/cards` - Issue, list, retrieve, activate, update cards
- `/v1/challenges` - 3DS challenge flow
- `/v1/card_programs` - Create, list, retrieve card programs

#### Disbursements & Money Movement
- `/v1/transfers` - Single transfers
- `/v1/batch_transfers` - Batch transfers
- `/v1/receiving_institutions` - List banks
- `/v1/payouts` - Get payout details, list payouts, get transactions
- `/v1/quotes` - Create quotes, get quotes
- `/v1/rates` - Get forex rates

#### Wallets & Balances
- `/v1/wallets` - Retrieve wallets
- `/v1/wallet_accounts` - List wallet accounts
- `/v1/wallet_transactions` - Create, retrieve wallet transactions

#### Ledger Management
- `/v1/ledgers` - Create, list, get, update, delete ledgers
- `/v1/ledger_accounts` - Full CRUD for ledger accounts
- `/v1/ledger_entries` - Get, update ledger entries
- `/v1/ledger_transactions` - Create, get, list, update transactions
- `/v1/ledger_balances` - Get balances

#### Fraud Detection (Prism)
- `/v1/fraud/scores` - Create, list, retrieve scores
- `/v1/fraud/reviews` - Approve, get reviews
- `/v1/fraud/rules` - Create, list, update, delete rules
- `/v1/fraud/rule_attributes` - List rule attributes

#### Platform/Partner Onboarding
- `/v1/platforms/accounts` - Create, get, update, activate accounts
- `/v1/platforms/file_records` - Upload documents
- `/v1/platforms/requirements` - Retrieve account requirements
- `/v1/consumers` - Create, update, submit related consumers
- `/v1/child_merchants` - Create, update, submit child merchants
- `/v1/verifications` - Account identity verification

#### QR Code Payments
- `/v1/qr_code_transactions` - Execute transfers via QR
- `/v1/qr_codes` - Generate static QR-PH codes

#### Checkouts
- `/v1/checkout_sessions` - Create v1 checkouts
- `/v2/checkout_sessions` - Create v2 checkouts

#### Contacts (for onboarding)
- `/v1/contacts` - Create, list, retrieve, update, delete
- `/v1/contact_details` - Create, list, retrieve, update, delete

#### Financial Services (Capital)
- `/v1/applications` - Loan applications
- `/v1/lenders` - Lender endpoints
- `/v1/offers` - Loan offers

#### Installment Plans
- `/v1/installment_plans` - List available installment plans

#### Workflows (FI-as-a-Service)
- `/v1/workflows` - Create, list, retrieve, delete, execute workflows
- `/v1/workflow_rules` - Create, list, update, delete rules
- `/v1/workflow_executions` - List, retrieve, terminate executions
- `/v1/workflow_triggers` - Trigger workflow events

#### Policies
- `/v1/policies` - Create, get, update, list policies
- `/v1/policies/evaluate` - Evaluate policies

#### Analytics
- `/v1/analytics` - Dashboard analytics
- `/v1/protect` - Fraud protection (Prism)

#### Customers (v2)
- `/v2/customers` - Create, list, get, update, patch customers

---

## Missing API Operations in Detail

### Payment Acceptance (Partially Implemented)
- ✅ POST `/v1/payment_intents` -> `intents create`
- ✅ GET `/v1/payment_intents/:id` -> `intents show`
- ✅ POST `/v1/payment_intents/:id/cancel` -> `intents cancel`
- ❌ **POST `/v1/payment_intents/:id/capture`** - Manual capture (separate!)
- ✅ POST `/v1/payment_intents/:id/attach` -> `intents attach`
- ✅ GET `/v1/payments` -> `payments list`
- ✅ GET `/v1/payments/:id` -> `payments show`
- ❌ **GET `/v1/payment_methods/:id`** - Not implemented
- ❌ **POST `/v1/checkout_sessions`** - Not implemented
- ❌ **POST `/v1/refunds`** - Not implemented as a standalone command

### Webhooks (Fully Implemented)
- ✅ All CRUD operations implemented
- ✅ Enable/disable
- ✅ Retry webhook delivery

### Sources (Basic)
- ✅ POST `/v1/sources` -> `sources create`
- ✅ GET `/v1/sources/:id` -> `sources show`

### Payment Links (Basic)
- ✅ POST `/v1/payment_links` -> `payment-links create`
- ✅ GET `/v1/payment_links/:id` -> `payment-links show`
- ✅ GET `/v1/payment_links` -> `payment-links list`

---

## Recommendations

### Priority 1: Missing Core Payment Features
1. **Capture payment intent** - `paymongo intents capture <id>` (POST `/v1/payment_intents/:id/capture`, separate from attach)
2. **Standalone refund command** - `paymongo refunds create <payment_id>` (POST `/v1/refunds`)
3. **Checkout sessions** - `paymongo checkout create` (POST `/v1/checkout_sessions`)
4. **Get payment method** - `paymongo payment-methods show <id>`

### Priority 2: High-Value Business Features
5. **Subscriptions** - `paymongo subscriptions` (list, create, cancel, change plan)
6. **Plans** - `paymongo plans` (list, create, retrieve, update)
7. **Payouts** - `paymongo payouts` (list, detail, transactions)
8. **Wallet transactions** - `paymongo wallet-transactions` (move money, retrieve)
9. **Transfers** (V2) - `paymongo transfers` (send money via API)
10. **Batch transfers** - `paymongo batch-transfers`

### Priority 3: Platform/Partner Features
11. **Platform accounts** - `paymongo platforms accounts` (CRUD)
12. **Child merchants** - `paymongo platforms merchants` (create, submit)
13. **Consumers** - `paymongo platforms consumers` (create, submit)
14. **File upload** - `paymongo platforms upload` (for document submission)
15. **Requirements** - `paymongo platforms requirements` (check requirements)

### Priority 4: Advanced Features
16. **Fraud (Prism)** - `paymongo fraud scores|reviews|rules`
17. **Customers v2** - `paymongo customers` (create, list, update)
18. **QR code payments** - `paymongo qr create`
19. **Invoices** - `paymongo invoices` (create, list, pay, add line items)
20. **Workflows** - `paymongo workflows`

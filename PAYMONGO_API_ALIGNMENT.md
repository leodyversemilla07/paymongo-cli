# PayMongo API Alignment

## Source of truth

This is a community-built, unofficial CLI. PayMongo's published guides and endpoint
OpenAPI definitions govern API behavior. Stripe-style ergonomics may inspire the
interface, but must not introduce undocumented PayMongo operations.

Official documentation index: https://docs.paymongo.com/llms.txt.
Append `.md` to documentation URLs to read their Markdown/OpenAPI definitions.

This document records **alignment passes over existing functionality, core intents, non-card Payment Methods, and a v1 Checkout subset**, not
full coverage or certification of the PayMongo API. The previous resource counts,
coverage percentage, and "full CRUD" claims were not a reliable contract audit.

## Verified contracts and corrections

| Area | Official contract | CLI alignment |
| --- | --- | --- |
| Authentication | HTTP Basic: secret API key as username, empty password | API client uses `base64(secret_key:)`; reject a key-prefix/configured-environment mismatch before any authenticated request or cache read |
| Payment Intent creation | Minimum integer amount 100, PHP currency, documented `payment_method_allowed` names | Shared Zod validation and identical creation flags across `intents create` and `payments create-intent` |
| Manual authorization | `capture_type: manual` for eligible card payments; hold becomes `awaiting_capture` | Added card-only manual creation and explicit authorization-state instructions |
| Card 3DS options | `payment_method_options.card.request_three_d_secure`: `any` or `automatic` | Added `--three-d-secure`, only when card is allowed |
| Attachment | POST `/:id/attach`, existing Payment Method ID, return URL for redirect flows | Added `intents attach`, validated IDs and supplied URLs, and displayed `next_action.redirect.url` without asserting immediate success |
| Capture | POST `/:id/capture`; optional amount for partial capture | Added `intents capture --amount`; full capture remains available when amount is omitted |
| Intent response state | Resource `livemode`, redirect action, and documented `awaiting_capture` authorization state | Corrected types and mode/status display |
| Local simulation | CLI helper, not PayMongo payment processing | Test-environment only; labeled JSON, zero-delay support, canonical method names, documented payment event envelopes |
| Payment Links create | `POST /v1/payment_links`; top-level request fields | Removed the legacy `data.attributes` wrapper |
| Payment Links validation | Integer amount 100–999999999, uppercase three-letter currency, required description (max 1000), string metadata values | Zod validation before API calls |
| Payment Links responses | Flat `data` resource; `url`; ISO 8601 dates; `active`/`archived` management state | Corrected types, JSON output, and terminal formatting; no longer interprets status as paid/unpaid |
| Payment Links listing | Documented query filters are `reference_number`, `status`, and `mode`; no documented `limit` parameter | Existing `--limit` applies locally to the returned list; no unsupported parameter sent |
| Refunds create | Required `data.attributes.amount`, `payment_id`, and `reason`; minimum integer amount 100 | CLI requires explicit amount/reason; client rejects incomplete requests rather than claiming an implicit full refund |
| Refund reasons | `duplicate`, `fraudulent`, `requested_by_customer`, `others` | All four accepted |
| Webhook creation | `POST /v1/webhooks`; `data.attributes.url` and `events`; signing secret returned as `secret_key` | Webhook command and dev session persist the documented field |
| Webhook secret output | Signing secrets are credentials, not diagnostic output | Redact `secret_key` from webhook JSON output and bulk exports |
| Webhook management | PUT updates; POST `/{id}/disable` and `/{id}/enable` | Documentation no longer claims a DELETE operation; disable is not deletion |
| Webhook envelopes | Outer `data.type` is `event`; event name is `data.attributes.type`; resource snapshot is `data.attributes.data` | Listener logs the real event type, nested payment details, and distinct event/resource IDs |
| Webhook signatures | SHA-256 HMAC of `timestamp + "." + raw_body`; `te` for test mode, `li` for live mode | Shared verifier does not fall back across modes and rejects malformed hex |
| Generated webhook handlers | Verify the original raw body, not reconstructed JSON | Express uses raw middleware, Fastify preserves the string body, Node reads the request stream; TypeScript generic handler accepts a raw string |
| Payment Method billing | Address field is `country`, not `country_code` | Corrected client and response types; validated billing JSON input |
| Non-card methods | POST `/v1/payment_methods`; type, optional billing/metadata, bank `details.bank_code` | Added non-card `payment-methods create`; DOB/Brankas bank selection; no raw-card CLI input |
| Method expiry | After attachment: QR Ph 60–9000 seconds; ShopeePay 1–3600 | Validated `--expiry-seconds` only for applicable types |
| Method retrieval | GET `/v1/payment_methods/:id`; `livemode` and type-specific details | Added `payment-methods show`, including tokenized card resources; removed invented method status |
| Checkout v1 lifecycle | POST `/v1/checkout_sessions`; GET `/:id`; POST `/:id/expire` without a JSON body | Added explicit v1 `checkout create`, `show`, and confirmed `expire`; no fabricated list/delete operation |
| Checkout creation | `data.attributes`, required line items/method types, max 999 items, quantity 1–1000000000, one image per item | Validated single-item/file input, bank-specific Checkout names, PHP, and documented redirect/display/receipt fields |
| Checkout state | Session `active`/`expired` is availability; cancel URL does not cancel records; `checkout_session.payment.paid` confirms Checkout payment | Show intent status separately; success redirects are not fulfillment evidence; expire is not a refund |
| New command output and transport | Diagnostic output must not expose credentials or billing PII; no verified mutation idempotency assumed | Recursively sanitized JSON, bounded input files, closed pools, silent read retries, no automatic creation/expiration replay |
| API errors | API failures expose status and error codes | Preserve API/authentication errors rather than wrapping them as retryable network errors |
| `dev --no-register` | Local CLI option, not an API feature | Honor Commander's `register: false`, including detached mode; skip startup stale-webhook disabling when registration is disabled |
| Application forwarding | Local transport, not a PayMongo API endpoint; original signing contract unchanged | Opt-in `dev --forward-to`, original bytes/signature, downstream status/timing, no redirects/retries, bounded bodies/timeouts and cleanup |
| Forwarding authentication | Forwarded signatures must use the upstream webhook's signing secret | No re-signing, key transfer, authorization/cookie forwarding, or claims that forwarding proves payment |

### Official references checked

- [Payment Links and migration](https://docs.paymongo.com/reference/payment-links)
- [Create Payment Link](https://docs.paymongo.com/reference/post_v1-payment-links)
- [List Payment Links](https://docs.paymongo.com/reference/get_v1-payment-links)
- [Get Payment Link Details](https://docs.paymongo.com/reference/get_v1-payment-links-id)
- [Create a Refund](https://docs.paymongo.com/reference/create-a-refund)
- [Create a Webhook](https://docs.paymongo.com/reference/create-a-webhook)
- [Webhook resource](https://docs.paymongo.com/reference/webhook-resource)
- [Webhook setup, management, and signing](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [Webhook event examples](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
- [Create a Payment Method](https://docs.paymongo.com/reference/create-a-paymentmethod)
- [Payment Method Resource](https://docs.paymongo.com/reference/the-payment-method-object)
- [Retrieve a Payment Method](https://docs.paymongo.com/reference/retrieve-a-paymentmethod)
- [Direct online banking](https://docs.paymongo.com/docs/payment-acceptance-direct-online-banking)
- [Create Checkout (v1)](https://docs.paymongo.com/reference/create-a-checkout)
- [Retrieve Checkout](https://docs.paymongo.com/reference/retrieve-a-checkout)
- [Expire Checkout](https://docs.paymongo.com/reference/expire-a-checkout-session)
- [Checkout Session Resource](https://docs.paymongo.com/reference/checkout-session-resource)
- [Hosted Checkout quick-start (v2)](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start)
- [Create a Payment Intent](https://docs.paymongo.com/reference/create-a-paymentintent)
- [Payment Intent Resource](https://docs.paymongo.com/reference/the-payment-intent-object)
- [Attach to Payment Intent](https://docs.paymongo.com/reference/attach-to-paymentintent)
- [Payment Acceptance key concepts](https://docs.paymongo.com/docs/payment-acceptance-key-concepts)
- [Hold then capture](https://docs.paymongo.com/docs/payment-acceptance-hold-then-capture)

### Documentation discrepancy to track

The Create Payment Intent endpoint reference lists `shopee_pay`, while the newer
e-wallet guide uses `shopeepay`. The CLI currently follows the endpoint's method
list. Do not silently normalize these names or claim that every listed method is
activated for every merchant; verify provider availability with PayMongo.

The Checkout endpoint reference documents `/v1/checkout_sessions` and its retrieve/
expire lifecycle, while the newer hosted quick-start uses `/v2/checkout_sessions`.
This pass implements only the explicitly documented v1 lifecycle and labels it in
help/docs. It does not assume v2 field parity or v2 lifecycle endpoints.

The hosted quick-start's illustrative webhook handler reads `event.type` and
`event.data`, while the webhook resource/event references place the event name
and snapshot in `data.attributes.type` and `data.attributes.data`. The CLI follows
that documented event envelope and verifies the original raw body; do not copy
an illustrative handler without reconciling its shape and adding verification.

## Local CLI helpers versus PayMongo operations

- `paymongo dev` exposes the **CLI's own listener** through ngrok. By default it
  receives/logs only. `--forward-to` explicitly opts into one-hop application
  forwarding with unchanged body/signature, downstream status/timing, and no
  redirects/retries. This does not change a PayMongo payment or event.
- Forwarding requires the app to use the same upstream signing secret. The CLI
  does not re-sign, transfer that secret, or infer fulfillment from an HTTP 2xx.
  Non-2xx/network/timeout outcomes remain failed acknowledgments to the sender.
- Existing opt-in analytics describe receipt/verification; terminal application
  delivery results are separate. URLs/queries/signatures/response bodies are not
  logged or saved in forwarding state.
- `paymongo trigger` posts a synthetic payload directly to the chosen URL.
  It does not create a real payment, update PayMongo payment status, or invoke
  PayMongo's real delivery/retry/test-event service.
- `trigger replay` resends a locally stored payload, not a remote PayMongo delivery.
- Dev shutdown disables its temporary webhook. It does not delete the endpoint.
- Local rate limits are CLI safeguards, not PayMongo's published server quotas.
- `intents attach --simulate` (also available under `payments attach`) never
  calls the payment API or modifies an intent. It is permitted only in the test
  environment and returns explicitly labeled synthetic JSON.
- The simulator's optional event helper emits only `payment.paid` or
  `payment.failed` envelopes; a local timeout does not imply a remote failure.
- Event tracking, key bundles, and generated code are local developer conveniences.

## Compatibility changes

- Payment Method creation validates non-card types, bank selection, expiry, and string
  metadata. The previous card-without-details request is explicitly rejected; card
  tokenization remains an application/Hosted Checkout responsibility.
- New `payment-methods`/`checkout` JSON output is sanitized, not an unredacted API dump.
  Billing PII, client keys, raw card fields, and known secret fields are removed.
- The CLI requires positive Checkout unit prices and safe total arithmetic as local
  safeguards; PayMongo remains authoritative for provider-specific amount limits.
- Intent creation now rejects amounts below 100 centavos, non-integer amounts,
  non-PHP currency, and unsupported method names before HTTP requests.
- Manual capture requires card-only methods; account restrictions remain enforced by PayMongo.
- Simulation is now test-only. Its JSON is an envelope with `simulated: true`,
  `paymentIntent`, `delayApplied`, and `simulationType`.
- `PaymentSimulator.generateWebhookEvents()` now returns event envelopes rather
  than partial objects with invented intent event names.
- `payment-links --json` returns the current flat Payment Links resource.
- Payment Link amount validation now enforces the documented range.
- `payments refund` requires both `--amount` and `--reason`.
- Test-mode verification no longer accepts a live-only signature.
- Generated TypeScript generic handlers accept raw strings instead of parsed bodies;
  generated Node handlers consume the original request stream.

## Remaining review and implementation scope

Do not describe this CLI as covering the entire PayMongo API. Follow-up work includes:

1. Audit legacy Sources commands, accepted payment methods, request fields, and
   redirect handling against the current Payment Intent/Payment Method guides.
2. Audit all synthetic fixtures (refund, QR, checkout, and link events) against
   documented event snapshots. They are developer examples, not authoritative resources.
3. Review payment list pagination and provider-specific amount limits. The core
   intent amount/currency constraints, manual capture options, redirect display,
   and authorization state have been aligned in this pass.
4. Add supported Payment Link filtering, updates, and related payments as separate
   documented features; do not equate a link's status with payment success.
5. Review retry/idempotency for existing mutations. Payment Method creation and
   the new Checkout creation/expiration operations do not automatically replay.
   Extend that policy only after checking documented idempotency contracts.
6. Review further forwarding observability/limits as separate local features.
   Current opt-in forwarding has raw-byte/signature preservation, HTTP status/
   timing, timeout/loop/body guards, detached support, and cleanup tests. It is
   not a production delivery queue or exactly-once mechanism.
7. Verify v2 Checkout contracts, merchant payment-method discovery, and advanced
   Seeds split/statement-descriptor options before exposing them. Current v1
   support is deliberately a subset, not complete Checkout API coverage.
8. Review the remaining guides and older roadmap claims. Existing commands do not
   imply subscription, issuing, wallet, or money-movement API support.

## Release readiness

`2.0.0-beta.1` is approved for the beta channel with outstanding account-level
verification explicitly documented. Dependencies have been patched, and release
metadata, package allowlisting, installed-tarball smoke checks, and strict
cross-platform CI have been added. Local full-project coverage passes unchanged
thresholds: 85.36% statements, 77.87% branches, 89.52% functions, and 85.37% lines,
with 1025 tests across 49 files. Publishing requires green latest-head CI and
registry authentication. Actual test payments, Checkout completion, and upstream
ngrok webhook verification remain unperformed; beta publication is not provider
contract or production certification. See [Release Checklist](RELEASE.md).

## Validation strategy

Use documentation-shaped fixtures to test request bodies, response parsing,
signature mode selection, raw-body handling, and API errors. These automated tests
mock external services; local forwarding integration tests additionally use real
loopback HTTP servers to check bytes/signatures/status/timeouts/shutdown. They are
not a live PayMongo or ngrok account verification.

Legacy Sources tests verify existing command/display behavior with mocked API
responses, not accepted provider methods or endpoint contracts. Synthetic trigger
helper tests assert the shared event envelope, not complete resource snapshots.
Team prompts/clipboard commands and login identity/storage/API calls are mocked;
login encryption and legacy migration exercise real cryptography. Passing code
coverage is not evidence that every legacy API operation has been documentation-audited.

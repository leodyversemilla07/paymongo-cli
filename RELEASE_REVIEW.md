# Prepared beta review

Candidate: **2.0.0-beta.1**, still unpublished. This report is not a complete
PayMongo API certification or approval to publish.

## Scope reviewed

- Intent/refund/link request and response changes, non-card Method and Checkout v1
  command validation, sensitive diagnostic JSON, and mutation cleanup policy.
- Original-body signatures, generated handlers, optional application forwarding,
  shutdown behavior, startup state ownership, and detached option propagation.
- Synthetic trigger/history handling, login cryptography and test/live separation,
  explicit team sharing/clipboard behavior, and generator failure exit status.
- Manifest/lockfile/CLI version alignment, package inclusion, installed-tarball
  behavior, dependency audits, reusable CI, and prerelease publishing safeguards.
- The working tree includes earlier changes and new untracked files; nothing has
  been staged or committed as part of this review.

## Findings fixed during review

1. **No-register still mutated webhooks.** Startup stale-webhook cleanup now runs
   only when automatic registration is enabled. Manual/existing webhook IDs and
   secrets are retained. Regression tests cover the CLI and configuration forms.
2. **Mode checks only existed in login.** The shared API transport now rejects
   configured test/live mode mismatches before authenticated requests and cache
   access, protecting manually edited/imported configurations as well.
3. **Legacy JSON could expose client keys/billing.** Canonical Intent and older
   Payments/Payment Link JSON paths now use the same recursive redaction utility.
   Tests cover creation, retrieval, attachment, capture, cancellation, and lists.
4. **A prepared changelog could pass a publishing check.** Explicit tag checks now
   require a valid finalized ISO release date. The ordinary preparation check
   remains usable; the current candidate's tag check intentionally exits with 1.

Previous regression work also corrected synthetic delivery labels, clipboard
shell handling, encryption-salt failures, login connection cleanup, generator
failure exits, and malformed history handling.

## Validation

- 1023 tests / 49 files; all unchanged coverage gates pass.
- Coverage: 85.22% statements, 77.85% branches, 88.96% functions, 85.22% lines.
- Build, Biome, metadata checks, and whitespace checks pass.
- Full and production dependency audits: zero reported vulnerabilities.
- Actual npm tarball installs and runs: bin shim/version/help/verifier checks and
  a real generator-write-failure nonzero exit check.
- Local verification is on Windows/Node 24; the declared remote OS/Node matrix has
  not been run against a committed candidate.
- No real PayMongo operations or ngrok connections were performed.

## Remaining gates and limits

- Obtain approval to commit the curated candidate and push a **non-release review
  branch** and open a PR against main/develop to run remote CI (feature-branch
  pushes alone do not match the current CI trigger). Do not use a v* tag to test CI.
- Obtain explicit authorization for test-mode resource and webhook verification,
  including configured credentials, enabled merchant channels, a local app that
  independently verifies signatures, and cleanup of created test resources.
- Verify native ngrok operation and fresh installation without suppressed scripts.
- Configure publishing credentials/permissions and branch/environment protections.
- Finalize changelog date and prepared/unpublished labels only after release approval.
- Legacy Sources provider/redirect contracts, synthetic resource snapshots,
  existing mutation retry/idempotency, pagination/provider limits, and Checkout v2
  remain outside the completed audit. Compatibility tests do not validate those
  provider contracts. Reconcile ambiguous mutation outcomes before retrying;
  do not use unfinished legacy mutation workflows for live payment operations.

The next step is review-branch CI and authorized test-mode verification, **not
publication**. See RELEASE.md for the operative checklist.

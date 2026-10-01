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
- The curated candidate includes the earlier changes and previously untracked
  files. With explicit authorization, it was committed as `0108fc1` and pushed to
  `release/beta-2.0.0-prep`; draft [PR #1](https://github.com/leodyversemilla07/paymongo-cli/pull/1)
  targets main. No release tag, publication, or merge was authorized or performed.

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
5. **Session tests depended on a developer's ngrok environment.** The first remote
   CI run exposed missing-token timeouts in otherwise mocked dev-session tests.
   Tests now stub a synthetic token and restore the environment afterward, so
   clean runners and developer shells use identical isolated authentication input.
   The focused suite passes with the inherited token explicitly removed.

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
- Local verification is on Windows/Node 24. The declared remote OS/Node matrix
  now runs against the committed candidate in PR #1; all latest-head checks must
  pass before this gate is complete. The initial run exposed the test isolation
  finding above; local success alone is not cross-platform certification.
- No real PayMongo operations or ngrok connections were performed.

## Remaining gates and limits

- Require green remote CI on the latest head of draft PR #1. The authorized
  commit, non-release review branch, and PR preparation are complete; neither
  merging nor publication is authorized. Do not use a v* tag to test CI.
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

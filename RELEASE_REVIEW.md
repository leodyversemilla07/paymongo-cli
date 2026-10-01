# Beta release review

Version: **2.0.0-beta.1**, approved for beta publication with account-level
verification deferred. This review snapshot is not proof of registry publication
or complete PayMongo API/production certification.

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
  targets main. The user subsequently requested merge and beta release after
  being informed that account verification cannot run without local test setup.
  Proceed with that limitation disclosed, without claiming manual tests passed.
  Final release metadata, latest-head CI, and registry authentication remain gates.

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
   remains usable. The prepared candidate correctly failed that gate; following
   release approval, the finalized 2026-10-01 date permits explicit-tag validation.
5. **Session tests depended on a developer's ngrok environment.** The first remote
   CI run exposed missing-token timeouts in otherwise mocked dev-session tests.
   Tests now stub a synthetic token and restore the environment afterward, so
   clean runners and developer shells use identical isolated authentication input.
   The focused suite passes with the inherited token explicitly removed.
6. **Persisted webhook cache could bypass account/mode checks.** Webhook reads
   now validate credentials before cache lookup, and list/resource keys include
   both the environment and a SHA-256 credential fingerprint, never the API key.
   Invalidations use the same namespace. Regression tests cover rejected mode
   mismatches even with cached data and distinct test/live/merchant cache keys.

Previous regression work also corrected synthetic delivery labels, clipboard
shell handling, encryption-salt failures, login connection cleanup, generator
failure exits, and malformed history handling.

## Validation

- 1025 tests / 49 files; all unchanged coverage gates pass.
- Coverage: 85.36% statements, 77.87% branches, 89.52% functions, 85.37% lines.
- Build, Biome, metadata checks, and whitespace checks pass.
- Full and production dependency audits: zero reported vulnerabilities.
- Actual npm tarball installs and runs: bin shim/version/help/verifier checks and
  a real generator-write-failure nonzero exit check.
- Local verification is on Windows/Node 24. All 15 remote OS/Node jobs passed on
  `2998cbe` in [run 36849258153](https://github.com/leodyversemilla07/paymongo-cli/actions/runs/36849258153).
  The initial run exposed the test isolation finding above. Final release metadata
  changes also require green latest-head CI before merge/release.
- A fresh packed installation with `--ignore-scripts=false` passed CLI checks and
  loaded the native ngrok binding. This does not prove tunnel connectivity; npm
  lifecycle-policy approval remains separate from explicit script suppression.
- No real PayMongo operations or ngrok connections were performed.
- Account preflight found no project `.paymongo`, no stored encrypted credentials,
  and no configured PayMongo key environment variables. Real test-mode payment,
  checkout, and upstream webhook verification cannot proceed without local setup.
- Repository `NPM_TOKEN` exists, but existence does not verify validity or publish
  access. The main branch currently has no branch protection configured.

## Remaining gates and limits

- Require green remote CI on the final head of PR #1 and successful registry
  authentication before publishing. Manual verification is deferred for this beta,
  not completed. Do not use a v* tag merely to test CI or bypass failed checks.
- Configure test credentials locally and identify an enabled merchant channel,
  then perform the authorized test-mode resource and webhook verification with
  an independently verifying local app and cleanup of created test resources.
  Never paste credentials into chat, source, PRs, or logs.
- Verify native ngrok operation and fresh installation without suppressed scripts.
- Configure publishing credentials/permissions and branch/environment protections.
- Release approval is recorded and the changelog date is finalized to 2026-10-01.
  Keep beta publication distinct from stable promotion and production approval.
- Legacy Sources provider/redirect contracts, synthetic resource snapshots,
  existing mutation retry/idempotency, pagination/provider limits, and Checkout v2
  remain outside the completed audit. Compatibility tests do not validate those
  provider contracts. Reconcile ambiguous mutation outcomes before retrying;
  do not use unfinished legacy mutation workflows for live payment operations.

Next: validate final metadata, merge the green reviewed PR, run nonpublishing
registry-authentication preflight, and publish the exact merged commit to beta.
Test-account verification remains necessary before stable/production promotion.
See RELEASE.md for the operative checklist.

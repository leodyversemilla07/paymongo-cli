# Release readiness and procedure

## Beta release: 2.0.0-beta.1

This prerelease is approved for the **beta** channel with outstanding account-level
verification documented below. Approval or a dated changelog does not itself prove
registry publication; confirm the GitHub release and registry state.
It is not a production certification or official PayMongo product. The major version reflects changes to existing JSON
contracts, required refund inputs, simulator envelopes, and generated handler APIs.

### Automated gates

```bash
npm ci
npm run release:check
npm run lint
npm audit
npm test
npm test -- --coverage
npm run test:package
```

- Build removes old dist artifacts before compiling. Use build:incremental only
  for local development, not release packaging.
- Publishing uses a file allowlist: compiled JavaScript, the CLI entrypoint, license,
  and selected user/release documentation. No source/tests/workflows/credentials.
- Package smoke checks create a real tarball, install it in a temporary project,
  and check the bin shim, version, command help, generation-failure exit status,
  and documented verifier module.
  They do not contact PayMongo or ngrok. Dependency installation uses the npm registry.
- Reusable CI runs strict tests and package checks on Linux, Windows, and macOS
  with Node 20.19.0, latest 20.x, 22.13.0, latest 22.x, and latest 24.x.
  No test failures are ignored. Configure branch protection to require the current
  reusable validation check names; previous check names may have changed.
- Supported Node range: ^20.19.0 || ^22.13.0 || >=24.0.0. Node 21 and 23 are not
  supported. Minimums match the dependency requirements; prefer a maintained LTS.
  Future Node majors admitted by the range are not all separately CI-certified.

### Coverage gate — passing locally

The full-project run passes **1025 tests across 49 files**, with no lowered
thresholds or additional production-code exclusions:

| Metric | Actual | Required |
| --- | ---: | ---: |
| Statements | 85.36% | 80% |
| Branches | 77.87% | 75% |
| Functions | 89.52% | 85% |
| Lines | 85.37% | 80% |

Tests execute real legacy Sources, team, generator, login, and trigger handlers,
plus event-store retention/corruption paths. Login tests use real AES-GCM and CBC
migration with completely mocked storage, identity, prompts, and API transport.
Sources compatibility tests and shared synthetic-envelope tests do **not** certify
provider support or the unreviewed resource fixtures. Remote CI and real account
verification remain separate gates. Never bypass or weaken the coverage check.

### Release checklist and deferred beta verification

- [x] Reach the enforced coverage targets with meaningful regression tests (local run).
- [x] Approve beta publication and finalize the changelog date: 2026-10-01.
- [x] Review and commit all intended files, including previously untracked files.
- [x] Open a review PR against main/develop and validate the declared OS/Node matrix: [PR #1](https://github.com/leodyversemilla07/paymongo-cli/pull/1), all 15 jobs passed on `2998cbe`. Require green latest-head CI for every subsequent change before merge/release.
- [ ] With explicit account authorization, use **test keys only** to verify a
  non-card method creation/attachment and the redirect flow for an enabled channel.
- [ ] Verify Checkout v1 create/show, a completed test payment, and expiration of a
  separate unpaid session. Do not assume an active session or success redirect is payment proof.
- [ ] Verify a real PayMongo webhook through ngrok to the local app, using the same
  upstream signing secret and original bytes. Include an application-failure case
  and event-ID deduplication. Automatic temporary registration can change the secret.
- [ ] Verify a fresh installation without lifecycle-script suppression for release
  environments that need native ngrok. Offline help tests do not verify tunnel connectivity.
- [ ] Check that the chosen version is still unused in the intended registries.
- [ ] Configure publishing credentials: NPM_TOKEN with appropriate access and the
  GitHub Packages permissions/association. No credentials belong in source or logs.

The user requested merge and release after being informed of the missing local
test-account setup. This beta proceeds with **real account verification deferred**,
not falsely marked complete. Configure test keys locally before completing the
unchecked payment, Checkout, and upstream-webhook checks; never send credentials
through chat. A fresh packed installation with `--ignore-scripts=false` loads the
native ngrok binding, but this and mocked tests do not prove actual delivery or
tunnel operation. Production/stable promotion requires completing that verification.

Require green latest-head CI, successful registry authentication, and unused
version/tag checks before tagging. Repository `NPM_TOKEN` is configured, but token
presence is not proof of validity or publishing access. A manual run of the Release
workflow (`gh workflow run release.yml --ref main`) checks npm authentication only;
it does not publish or create tags. Tag runs require that preflight plus the full
validation matrix before publication. Main currently has no branch protection;
configure protections before broader/stable rollout. Do not bypass failed checks.

A dependency audit is a point-in-time check, not proof of complete security.
Provider-specific limits, legacy Sources, synthetic fixtures, existing mutation
idempotency, and Checkout v2 remain review scope in PAYMONGO_API_ALIGNMENT.md.

## Publishing (only after explicit approval)

Update package.json and package-lock.json together. CLI version/User-Agent read
package metadata automatically. Keep the changelog section and tag consistent.

```bash
npm run release:check
# After approval, finalize release metadata, review and merge,
# obtain green CI and credential preflight, and document any beta deferrals:
npm run release:check -- v2.0.0-beta.1
git tag -a v2.0.0-beta.1 -m "Release 2.0.0-beta.1"
git push origin v2.0.0-beta.1
```

**Pushing a v* tag triggers publishing.** Do not push one just to test the workflow.
The release workflow reruns the full matrix before the publishing job, rejects a
tag/version mismatch or an undated/prepared changelog, publishes any prerelease to **beta** in both registries,
and marks its GitHub release as a prerelease. Stable versions publish to latest.
It does not automatically promote a beta to stable.

```bash
npm install -g paymongo-cli@beta
```

If npm publishing succeeds but GitHub Packages fails, the release can be partial.
Already-published package versions are immutable: investigate the registry state
rather than blindly rerunning the entire publish job or changing the tag contents.

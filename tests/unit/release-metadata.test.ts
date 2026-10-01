import { describe, expect, it } from 'vitest';
import {
  checkRelease,
  getReleaseMetadata,
  validateReleaseDate,
} from '../../scripts/release-metadata.mjs';

describe('Release metadata gates', () => {
  it.each([
    '2.0.0-beta.1',
    '2.0.0-alpha.1',
    '2.0.0-rc.1',
    '2.0.0-preview',
    '2.0.0-0',
  ])('keeps prerelease %s off latest', (version) => {
    expect(getReleaseMetadata(version, `v${version}`)).toEqual({
      version,
      npmTag: 'beta',
      prerelease: true,
    });
  });
  it.each(['2.0.0', '2.1.3', '10.0.0'])('routes stable %s to latest', (version) => {
    expect(getReleaseMetadata(version, `v${version}`)).toEqual({
      version,
      npmTag: 'latest',
      prerelease: false,
    });
  });
  it.each([
    '',
    '2.0',
    '02.0.0',
    '2.00.0',
    '2.0.00',
    '2.0.0-',
    '2.0.0-beta.1\n',
    '2.0.0-beta.01',
    '2.0.0+build',
    '2.0.0-beta\nmalicious=value',
  ])('rejects noncanonical version %s', (version) => {
    expect(() => getReleaseMetadata(version, `v${version}`)).toThrow();
  });
  it.each([
    'v1.4.15',
    '2.0.0-beta.1',
    'v2.0.0',
    'v2.0.0-beta.2',
  ])('rejects mismatched tag %s', (tag) => {
    expect(() => getReleaseMetadata('2.0.0-beta.1', tag)).toThrow('exactly match');
  });
  it.each(['2026-10-01', '2024-02-29'])('accepts finalized date %s', (date) => {
    expect(() => validateReleaseDate(date)).not.toThrow();
  });
  it.each([
    'Prepared, unpublished',
    '',
    '2026-02-30',
    '2026-13-01',
    '2026-1-2',
    '2026-10-01\n',
    undefined,
  ])('rejects unfinished or invalid release date %s', (date) => {
    expect(() => validateReleaseDate(date)).toThrow('Finalize the changelog');
  });
  it('validates the real manifest and lockfile consistently', async () => {
    const metadata = await checkRelease();
    expect(metadata).toEqual({ version: '2.0.0-beta.1', npmTag: 'beta', prerelease: true });
  });
  it('rejects tag mismatches before publishing', async () => {
    await expect(checkRelease('v1.4.15')).rejects.toThrow();
  });
});

import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Reject mismatched release tags and keep every prerelease off npm latest. */
export function getReleaseMetadata(version, tag) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version
    );
  if (
    !match ||
    match[0] !== version ||
    match[4]
      ?.split('.')
      .some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))
  ) {
    throw new Error(
      'Release version must be canonical major.minor.patch with an optional prerelease'
    );
  }
  if (tag !== `v${version}`) throw new Error('Release tag must exactly match the package version');
  const prerelease = match[4] !== undefined;
  return { version, npmTag: prerelease ? 'beta' : 'latest', prerelease };
}

/** Publishing must not accept an undated/prepared changelog section. */
export function validateReleaseDate(date) {
  const parsed =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Date.parse(`${date}T00:00:00Z`)
      : Number.NaN;
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new Error('Finalize the changelog release date before publishing');
  }
}

export async function checkRelease(tag) {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  if (lock.version !== manifest.version || lock.packages?.['']?.version !== manifest.version) {
    throw new Error('Package and lockfile versions must match before release');
  }
  if (lock.packages?.['']?.engines?.node !== manifest.engines?.node) {
    throw new Error('Package and lockfile Node support must match before release');
  }
  const metadata = getReleaseMetadata(manifest.version, tag ?? `v${manifest.version}`);
  const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
  const prefix = `## [${metadata.version}] - `;
  const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(prefix));
  if (!heading) throw new Error('Changelog must include the candidate version before release');
  if (tag !== undefined) validateReleaseDate(heading.slice(prefix.length).trim());
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const metadata = await checkRelease(process.argv[2]);
    console.log(JSON.stringify(metadata));
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `version=${metadata.version}\nnpm_tag=${metadata.npmTag}\nprerelease=${metadata.prerelease}\n`
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release validation failed');
    process.exitCode = 1;
  }
}

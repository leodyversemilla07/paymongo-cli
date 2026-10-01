import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyBundle, TeamMember } from '../../src/services/team/service.js';

type InputOptions = { message: string; validate: (value: string) => true | string };
const m = vi.hoisted(() => ({
  create: vi.fn<() => Promise<KeyBundle>>(),
  serialize: vi.fn<(bundle: KeyBundle) => string>(),
  deserialize: vi.fn<(value: string) => KeyBundle>(),
  import: vi.fn(),
  members: vi.fn<() => Promise<TeamMember[]>>(),
  info: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  input: vi.fn<(options: InputOptions) => Promise<string>>(),
  confirm: vi.fn(),
  exec: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../src/services/config/manager.js', () => ({ ConfigManager: vi.fn() }));
vi.mock('../../src/services/team/service.js', () => ({
  TeamService: vi.fn().mockImplementation(() => ({
    createKeyBundle: m.create,
    serializeBundle: m.serialize,
    deserializeBundle: m.deserialize,
    importKeyBundle: m.import,
    listMembers: m.members,
    getTeamInfo: m.info,
    renameTeam: m.rename,
    removeMember: m.remove,
  })),
}));
vi.mock('../../src/utils/spinner.js', () => ({ default: vi.fn().mockImplementation(() => m) }));
vi.mock('@inquirer/prompts', () => ({ input: m.input, confirm: m.confirm }));
vi.mock('node:child_process', () => ({ execFileSync: m.exec }));

const bundle: KeyBundle = {
  id: 'bundle_fixture',
  createdAt: 1700000000000,
  environments: ['test'],
  keys: {},
  sharedWith: [],
};
const serialized = JSON.stringify(bundle);
const output = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');

describe('Team command workflows (no credentials, clipboard, or filesystem access)', () => {
  let command: Command;
  let CommandError: typeof import('../../src/utils/errors.js').CommandError;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    m.create.mockReset().mockResolvedValue(bundle);
    m.serialize.mockReset().mockReturnValue(serialized);
    m.deserialize.mockReset().mockReturnValue(bundle);
    m.import.mockReset().mockResolvedValue(undefined);
    m.members.mockReset().mockResolvedValue([]);
    m.info.mockReset().mockResolvedValue({
      name: undefined,
      memberCount: 0,
      sharedBundlesCount: 0,
      environments: [],
    });
    m.rename.mockReset().mockResolvedValue(undefined);
    m.remove.mockReset().mockResolvedValue(undefined);
    m.input.mockReset().mockResolvedValueOnce(serialized).mockResolvedValueOnce('Alice');
    m.confirm.mockReset().mockResolvedValue(true);
    m.exec.mockReset().mockReturnValue(Buffer.from(''));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    command = (await import('../../src/commands/team/index.js')).default;
    command.exitOverride();
    ({ CommandError } = await import('../../src/utils/errors.js'));
  });
  afterEach(() => vi.restoreAllMocks());
  const run = (args: string[]) => command.parseAsync(args, { from: 'user' });

  it('defaults sharing to test only and displays the explicitly requested fixture bundle', async () => {
    await run(['share-keys']);
    expect(m.create).toHaveBeenCalledWith(['test']);
    expect(m.serialize).toHaveBeenCalledWith(bundle);
    expect(console.log).toHaveBeenCalledWith(serialized);
    expect(output()).toContain('bundle_fixture');
    expect(m.exec).not.toHaveBeenCalled();
  });
  it('normalizes a requested environment list', async () => {
    await run(['share-keys', '--env', ' TEST , LIVE ']);
    expect(m.create).toHaveBeenCalledWith(['test', 'live']);
  });
  it.each([
    'production',
    'test,unknown',
    '',
  ])('rejects invalid environment %s before bundling', async (environment) => {
    await expect(run(['share-keys', '--env', environment])).rejects.toBeInstanceOf(CommandError);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalled();
  });
  it('passes bundle contents only through stdin, including shell metacharacters', async () => {
    const hostileText = JSON.stringify({ id: "quote' & `printf should-not-run`", keys: {} });
    m.serialize.mockReturnValue(hostileText);
    await run(['share-keys', '--copy']);
    expect(m.exec).toHaveBeenCalledExactlyOnceWith('clip', [], {
      input: hostileText,
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });
    expect(output()).toContain('Copied to clipboard');
  });
  it('falls back to xclip without using a shell when clip is unavailable', async () => {
    m.exec.mockImplementationOnce(() => {
      throw new Error('Unavailable');
    });
    await run(['share-keys', '--copy']);
    expect(m.exec).toHaveBeenNthCalledWith(2, 'xclip', ['-selection', 'clipboard'], {
      input: serialized,
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });
    expect(output()).toContain('Copied to clipboard');
  });
  it('keeps a completed export usable when neither clipboard utility is available', async () => {
    m.exec.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    await run(['share-keys', '--copy']);
    expect(console.log).toHaveBeenCalledWith(serialized);
    expect(output()).toContain('Clipboard copy not available');
  });
  it('handles a failure preparing clipboard data separately from the completed export', async () => {
    m.serialize.mockReturnValueOnce(serialized).mockImplementationOnce(() => {
      throw new Error('Serialization failed');
    });
    await run(['share-keys', '--copy']);
    expect(output()).toContain('Clipboard copy not available');
    expect(m.exec).not.toHaveBeenCalled();
  });
  it.each([false, true])('passes force=%s through to bundle import', async (force) => {
    await run(['import-keys', ...(force ? ['--force'] : [])]);
    expect(m.deserialize).toHaveBeenCalledWith(serialized);
    expect(m.import).toHaveBeenCalledWith(bundle, 'Alice', { force: force || undefined });
    expect(m.succeed).toHaveBeenCalledWith('Keys imported successfully!');
    expect(output()).toContain('Alice');
    expect(output()).toContain('bundle_fixture');
  });
  it('validates pasted JSON and member names through the actual prompt callbacks', async () => {
    await run(['import-keys']);
    const jsonValidation = m.input.mock.calls[0]?.[0].validate;
    const nameValidation = m.input.mock.calls[1]?.[0].validate;
    expect(jsonValidation?.(' ')).toBe('Please paste the key bundle JSON');
    expect(jsonValidation?.('{bad')).toBe('Invalid JSON format');
    expect(jsonValidation?.('{}')).toBe(true);
    expect(nameValidation?.(' ')).toBe('Please enter a member name');
    expect(nameValidation?.('Alice')).toBe(true);
  });
  it('stops import before saving when bundle deserialization fails', async () => {
    m.deserialize.mockImplementation(() => {
      throw new Error('Invalid fixture bundle');
    });
    await expect(run(['import-keys'])).rejects.toBeInstanceOf(CommandError);
    expect(m.import).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalled();
  });
  it('reports an empty team without attempting to render members', async () => {
    await run(['list-members']);
    expect(output()).toContain('No team members yet');
    expect(output()).toContain('Environments Available: none');
  });
  it('renders optional member fields and team metadata', async () => {
    m.members.mockResolvedValue([
      { name: 'Alice', email: 'alice@example.com', addedAt: 1700000000000, sharedKeys: ['test'] },
      { name: 'Bob', addedAt: 1700000000000 },
    ]);
    m.info.mockResolvedValue({
      name: 'Fixture team',
      memberCount: 2,
      sharedBundlesCount: 1,
      environments: ['test'],
    });
    await run(['list-members']);
    expect(output()).toContain('Fixture team');
    expect(output()).toContain('Alice');
    expect(output()).toContain('alice@example.com');
    expect(output()).toContain('Bob');
    expect(output()).toContain('N/A');
    expect(output()).toContain('none');
    expect(output()).toContain('Total members: 2');
  });
  it('renames the team with the exact supplied name', async () => {
    await run(['rename', 'Fixture team']);
    expect(m.rename).toHaveBeenCalledWith('Fixture team');
    expect(m.succeed).toHaveBeenCalledWith('Team name updated!');
  });
  it('defaults removal confirmation to no and performs no mutation on cancellation', async () => {
    m.confirm.mockResolvedValue(false);
    await run(['remove-member', 'Alice']);
    expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
    expect(m.remove).not.toHaveBeenCalled();
    expect(output()).toContain('Operation cancelled');
  });
  it('removes only the confirmed member and clarifies that keys are retained', async () => {
    await run(['remove-member', 'Alice']);
    expect(m.remove).toHaveBeenCalledWith('Alice');
    expect(output()).toContain('API keys remain');
  });
  it.each([
    ['share-keys', 'create'],
    ['import-keys', 'import'],
    ['list-members', 'members'],
    ['rename', 'rename'],
    ['remove-member', 'remove'],
  ] as const)('surfaces %s service failures as command errors', async (subcommand, method) => {
    m[method].mockRejectedValue(new Error('Fixture service failure'));
    await expect(
      run([subcommand, ...(['rename', 'remove-member'].includes(subcommand) ? ['Alice'] : [])])
    ).rejects.toBeInstanceOf(CommandError);
    expect(m.stop).toHaveBeenCalled();
    expect(m.succeed).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), 'Fixture service failure');
  });
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TeamService } from '../../src/services/team/service.js';
import type { KeyBundle } from '../../src/services/team/service.js';
import { PayMongoError } from '../../src/utils/errors.js';

const mockConfig = {
  load: jest.fn<() => Promise<Record<string, unknown> | null>>(),
  save: jest.fn<() => Promise<void>>(),
};

let teamService: TeamService;

const baseConfig = () => ({
  projectName: 'test-project',
  version: '1.0',
  environment: 'test' as const,
  apiKeys: {
    test: { public: 'pk_test_xxx', secret: 'sk_test_xxx' },
  },
  team: {
    members: [] as Array<{ name: string; addedAt: number; sharedKeys?: string[] }>,
    sharedKeyBundles: [] as Array<Record<string, unknown>>,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  teamService = new TeamService({ config: mockConfig as any });
});

describe('TeamService', () => {
  describe('createKeyBundle', () => {
    it('creates bundle with test keys successfully', async () => {
      const config = baseConfig();
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      const bundle = await teamService.createKeyBundle(['test']);

      expect(bundle.id).toBeDefined();
      expect(bundle.id).toHaveLength(16); // 8 random bytes = 16 hex chars
      expect(bundle.environments).toEqual(['test']);
      expect(bundle.keys.test).toEqual({ public: 'pk_test_xxx', secret: 'sk_test_xxx' });
      expect(bundle.sharedWith).toEqual([]);
      expect(mockConfig.save).toHaveBeenCalledTimes(1);
    });

    it('throws CONFIG_NOT_FOUND when no config', async () => {
      mockConfig.load.mockResolvedValue(null);

      await expect(teamService.createKeyBundle(['test'])).rejects.toThrow(PayMongoError);
      await expect(teamService.createKeyBundle(['test'])).rejects.toThrow(
        'No configuration found'
      );
    });

    it('throws NO_KEYS_FOUND when env has no keys', async () => {
      const config = baseConfig();
      delete (config.apiKeys as any).test;
      mockConfig.load.mockResolvedValue(config);

      await expect(teamService.createKeyBundle(['live'])).rejects.toThrow(PayMongoError);
      try {
        await teamService.createKeyBundle(['live']);
      } catch (error) {
        expect((error as PayMongoError).code).toBe('NO_KEYS_FOUND');
      }
    });

    it('stores bundle reference in config.team.sharedKeyBundles', async () => {
      const config = baseConfig();
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      const bundle = await teamService.createKeyBundle(['test']);

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.team.sharedKeyBundles).toHaveLength(1);
      expect(savedConfig.team.sharedKeyBundles[0].id).toBe(bundle.id);
      expect(savedConfig.team.sharedKeyBundles[0].environments).toEqual(['test']);
    });
  });

  describe('importKeyBundle', () => {
    const validBundle: KeyBundle = {
      id: 'abc123',
      createdAt: Date.now(),
      environments: ['test'],
      keys: {
        test: { public: 'pk_test_new', secret: 'sk_test_new' },
      },
      sharedWith: [],
    };

    it('imports keys for new member', async () => {
      const config = baseConfig();
      // No existing test keys so import goes through without force
      config.apiKeys = {};
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      await teamService.importKeyBundle(validBundle, 'Alice');

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.team.members).toHaveLength(1);
      expect(savedConfig.team.members[0].name).toBe('Alice');
      expect(savedConfig.team.members[0].sharedKeys).toContain('test');
      expect(savedConfig.apiKeys.test).toEqual({ public: 'pk_test_new', secret: 'sk_test_new' });
    });

    it('throws CONFIG_NOT_FOUND when no config', async () => {
      mockConfig.load.mockResolvedValue(null);

      await expect(teamService.importKeyBundle(validBundle, 'Alice')).rejects.toThrow(
        PayMongoError
      );
    });

    it('throws INVALID_BUNDLE for invalid bundle format', async () => {
      const config = baseConfig();
      mockConfig.load.mockResolvedValue(config);

      const invalidBundle = { id: '', keys: null, environments: null } as any;

      try {
        await teamService.importKeyBundle(invalidBundle, 'Alice');
        expect(true).toBe(false); // should not reach
      } catch (error) {
        expect(error).toBeInstanceOf(PayMongoError);
        expect((error as PayMongoError).code).toBe('INVALID_BUNDLE');
      }
    });

    it('skips overwrite without --force and logs warning', async () => {
      const config = baseConfig(); // has test keys already
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await teamService.importKeyBundle(validBundle, 'Bob');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TEST keys already exist')
      );
      // Original keys should remain unchanged
      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.apiKeys.test).toEqual({ public: 'pk_test_xxx', secret: 'sk_test_xxx' });

      consoleSpy.mockRestore();
    });

    it('overwrites with --force flag', async () => {
      const config = baseConfig(); // has test keys already
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      await teamService.importKeyBundle(validBundle, 'Bob', { force: true });

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.apiKeys.test).toEqual({ public: 'pk_test_new', secret: 'sk_test_new' });
    });

    it('adds to existing member sharedKeys', async () => {
      const config = baseConfig();
      config.apiKeys = {} as any;
      config.team.members = [{ name: 'Alice', addedAt: 1000, sharedKeys: [] }];
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      await teamService.importKeyBundle(validBundle, 'Alice');

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      // Should not create a duplicate member
      expect(savedConfig.team.members).toHaveLength(1);
      expect(savedConfig.team.members[0].sharedKeys).toContain('test');
    });
  });

  describe('listMembers', () => {
    it('returns team members', async () => {
      const config = baseConfig();
      config.team.members = [
        { name: 'Alice', addedAt: 1000 },
        { name: 'Bob', addedAt: 2000 },
      ];
      mockConfig.load.mockResolvedValue(config);

      const members = await teamService.listMembers();

      expect(members).toHaveLength(2);
      expect(members[0]!.name).toBe('Alice');
      expect(members[1]!.name).toBe('Bob');
    });

    it('returns empty array when no config', async () => {
      mockConfig.load.mockResolvedValue(null);

      const members = await teamService.listMembers();

      expect(members).toEqual([]);
    });
  });

  describe('getTeamInfo', () => {
    it('returns correct team info with members and bundles', async () => {
      const config = baseConfig();
      config.team.members = [{ name: 'Alice', addedAt: 1000 }];
      config.team.sharedKeyBundles = [{ id: 'b1' }];
      (config.team as any).name = 'My Team';
      mockConfig.load.mockResolvedValue(config);

      const info = await teamService.getTeamInfo();

      expect(info.name).toBe('My Team');
      expect(info.memberCount).toBe(1);
      expect(info.sharedBundlesCount).toBe(1);
      expect(info.environments).toContain('test');
    });

    it('returns defaults when no team data', async () => {
      mockConfig.load.mockResolvedValue(null);

      const info = await teamService.getTeamInfo();

      expect(info.name).toBeUndefined();
      expect(info.memberCount).toBe(0);
      expect(info.sharedBundlesCount).toBe(0);
      expect(info.environments).toEqual([]);
    });
  });

  describe('serializeBundle / deserializeBundle', () => {
    it('round-trips a bundle correctly', () => {
      const bundle: KeyBundle = {
        id: 'test-id',
        createdAt: 1700000000000,
        environments: ['test'],
        keys: {
          test: { public: 'pk_test_round', secret: 'sk_test_round' },
        },
        sharedWith: ['Alice'],
      };

      const serialized = teamService.serializeBundle(bundle);
      const deserialized = teamService.deserializeBundle(serialized);

      expect(deserialized.id).toBe(bundle.id);
      expect(deserialized.environments).toEqual(bundle.environments);
      expect(deserialized.keys.test).toEqual(bundle.keys.test);
    });

    it('deserializeBundle throws PayMongoError for invalid JSON', () => {
      expect(() => teamService.deserializeBundle('not valid json')).toThrow(PayMongoError);
      expect(() => teamService.deserializeBundle('{}')).toThrow(PayMongoError);
    });
  });

  describe('removeMember', () => {
    it('removes existing member', async () => {
      const config = baseConfig();
      config.team.members = [
        { name: 'Alice', addedAt: 1000 },
        { name: 'Bob', addedAt: 2000 },
      ];
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      await teamService.removeMember('Alice');

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.team.members).toHaveLength(1);
      expect(savedConfig.team.members[0].name).toBe('Bob');
    });

    it('throws MEMBER_NOT_FOUND for non-existent member', async () => {
      const config = baseConfig();
      config.team.members = [{ name: 'Alice', addedAt: 1000 }];
      mockConfig.load.mockResolvedValue(config);

      try {
        await teamService.removeMember('Charlie');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PayMongoError);
        expect((error as PayMongoError).code).toBe('MEMBER_NOT_FOUND');
      }
    });

    it('throws NO_MEMBERS when no team members exist', async () => {
      mockConfig.load.mockResolvedValue({ projectName: 'test' });

      try {
        await teamService.removeMember('Alice');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PayMongoError);
        expect((error as PayMongoError).code).toBe('NO_MEMBERS');
      }
    });
  });

  describe('renameTeam', () => {
    it('renames team successfully', async () => {
      const config = baseConfig();
      mockConfig.load.mockResolvedValue(config);
      mockConfig.save.mockResolvedValue(undefined);

      await teamService.renameTeam('New Team Name');

      const savedConfig = mockConfig.save.mock.calls[0]![0] as any;
      expect(savedConfig.team.name).toBe('New Team Name');
    });

    it('throws CONFIG_NOT_FOUND when no config', async () => {
      mockConfig.load.mockResolvedValue(null);

      await expect(teamService.renameTeam('New Name')).rejects.toThrow(PayMongoError);
    });
  });
});

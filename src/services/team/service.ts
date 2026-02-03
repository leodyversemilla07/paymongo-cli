import { ConfigManager } from '../config/manager.js';
import { PayMongoError } from '../../utils/errors.js';
import crypto from 'crypto';

export interface TeamMember {
  name: string;
  email?: string;
  addedAt: number;
  sharedKeys?: string[]; // Environment keys that were shared
}

export interface KeyBundle {
  id: string;
  createdAt: number;
  environments: ('test' | 'live')[];
  keys: {
    test?: {
      public: string;
      secret: string;
    };
    live?: {
      public: string;
      secret: string;
    };
  };
  sharedWith: string[]; // Member names who received this bundle
}

export interface TeamServiceOptions {
  config: ConfigManager;
}

export class TeamService {
  private config: ConfigManager;

  constructor(options: TeamServiceOptions) {
    this.config = options.config;
  }

  async createKeyBundle(environments: ('test' | 'live')[] = ['test']): Promise<KeyBundle> {
    const config = await this.config.load();
    if (!config) {
      throw new PayMongoError(
        'No configuration found. Run "paymongo init" first.',
        'CONFIG_NOT_FOUND',
        400
      );
    }

    // Generate unique bundle ID
    const bundleId = crypto.randomBytes(8).toString('hex');

    const bundle: KeyBundle = {
      id: bundleId,
      createdAt: Date.now(),
      environments: environments,
      keys: {},
      sharedWith: [],
    };

    // Add requested environment keys
    environments.forEach((env) => {
      if (config.apiKeys?.[env]) {
        bundle.keys[env] = { ...config.apiKeys[env] };
      }
    });

    // Check if any keys were found
    if (Object.keys(bundle.keys).length === 0) {
      throw new PayMongoError(
        `No API keys found for requested environments: ${environments.join(', ')}`,
        'NO_KEYS_FOUND',
        400
      );
    }

    // Store bundle in config for tracking
    if (!config.team) {
      config.team = {};
    }
    if (!config.team.sharedKeyBundles) {
      config.team.sharedKeyBundles = [];
    }
    config.team.sharedKeyBundles.push({
      id: bundle.id,
      createdAt: bundle.createdAt,
      environments: bundle.environments,
      sharedWith: bundle.sharedWith,
    });

    await this.config.save(config);

    return bundle;
  }

  async importKeyBundle(
    bundle: KeyBundle,
    memberName: string,
    options: { force?: boolean } = {}
  ): Promise<void> {
    const config = await this.config.load();
    if (!config) {
      throw new PayMongoError(
        'No configuration found. Run "paymongo init" first.',
        'CONFIG_NOT_FOUND',
        400
      );
    }

    // Validate bundle
    if (!bundle.id || !bundle.keys || !bundle.environments) {
      throw new PayMongoError('Invalid key bundle format.', 'INVALID_BUNDLE', 400);
    }

    // Initialize team config if needed
    if (!config.team) {
      config.team = {};
    }
    if (!config.team.members) {
      config.team.members = [];
    }

    // Check if member already exists
    let member = config.team.members.find((m) => m.name === memberName);
    if (!member) {
      member = {
        name: memberName,
        addedAt: Date.now(),
        sharedKeys: [],
      };
      config.team.members.push(member);
    }

    // Import keys for each environment
    bundle.environments.forEach((env) => {
      if (bundle.keys[env]) {
        if (!config.apiKeys) {
          config.apiKeys = {};
        }
        if (!config.apiKeys[env]) {
          config.apiKeys[env] = bundle.keys[env];
        } else if (options.force) {
          config.apiKeys[env] = bundle.keys[env];
        } else {
          console.log(`⚠️  ${env.toUpperCase()} keys already exist. Use --force to overwrite.`);
        }

        // Track shared key
        if (member && !member.sharedKeys?.includes(env)) {
          if (!member.sharedKeys) {
            member.sharedKeys = [];
          }
          member.sharedKeys.push(env);
        }
      }
    });

    await this.config.save(config);
  }

  async listMembers(): Promise<TeamMember[]> {
    const config = await this.config.load();
    return config?.team?.members || [];
  }

  async getTeamInfo(): Promise<{
    name: string | undefined;
    memberCount: number;
    sharedBundlesCount: number;
    environments: string[];
  }> {
    const config = await this.config.load();
    const team = config?.team;

    const environments = new Set<string>();
    if (config?.apiKeys?.test) {
      environments.add('test');
    }
    if (config?.apiKeys?.live) {
      environments.add('live');
    }

    return {
      name: team?.name || undefined,
      memberCount: team?.members?.length || 0,
      sharedBundlesCount: team?.sharedKeyBundles?.length || 0,
      environments: Array.from(environments),
    };
  }

  serializeBundle(bundle: KeyBundle): string {
    // Create a shareable JSON string
    const shareableBundle = {
      id: bundle.id,
      createdAt: bundle.createdAt,
      environments: bundle.environments,
      keys: bundle.keys,
    };

    return JSON.stringify(shareableBundle, null, 2);
  }

  deserializeBundle(bundleJson: string): KeyBundle {
    try {
      const parsed = JSON.parse(bundleJson);

      // Validate required fields
      if (!parsed.id || !parsed.environments || !parsed.keys) {
        throw new Error('Invalid bundle format');
      }

      return parsed as KeyBundle;
    } catch (_error) {
      throw new PayMongoError('Invalid key bundle JSON.', 'INVALID_JSON', 400);
    }
  }

  async removeMember(memberName: string): Promise<void> {
    const config = await this.config.load();
    if (!config?.team?.members) {
      throw new PayMongoError('No team members found.', 'NO_MEMBERS', 404);
    }

    const memberIndex = config.team.members.findIndex((m) => m.name === memberName);
    if (memberIndex === -1) {
      throw new PayMongoError(`Team member "${memberName}" not found.`, 'MEMBER_NOT_FOUND', 404);
    }

    config.team.members.splice(memberIndex, 1);
    await this.config.save(config);
  }

  async renameTeam(newName: string): Promise<void> {
    const config = await this.config.load();
    if (!config) {
      throw new PayMongoError('No configuration found.', 'CONFIG_NOT_FOUND', 404);
    }

    if (!config.team) {
      config.team = {};
    }

    config.team.name = newName;
    await this.config.save(config);
  }
}

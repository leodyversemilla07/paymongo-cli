import { ConfigManager } from '../config/manager';
import { GitHubClient, GitHubFileContent } from './client';
import { GitHubAuthService } from './auth';

export interface TeamSyncOptions {
  config: ConfigManager;
  auth: GitHubAuthService;
}

export interface SyncOptions {
  repo: string;
  branch?: string;
  force?: boolean;
  direction?: 'push' | 'pull' | 'sync';
}

export class TeamSyncService {
  private config: ConfigManager;
  private auth: GitHubAuthService;

  constructor(options: TeamSyncOptions) {
    this.config = options.config;
    this.auth = options.auth;
  }

  async sync(options: SyncOptions): Promise<void> {
    const { repo, branch = 'main', force = false, direction = 'sync' } = options;

    // Parse repo string (owner/repo)
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      throw new Error('Invalid repository format. Use "owner/repo" format.');
    }

    // Get authenticated GitHub client
    const client = await this.auth.authenticate();

    // Ensure repo exists
    let githubRepo;
    try {
      githubRepo = await client.getRepo(owner, repoName);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new Error(
          `Repository "${repo}" not found. Please create it first or check permissions.`
        );
      }
      throw error;
    }

    // Check if repo is accessible
    if (githubRepo.private && !client.hasToken()) {
      throw new Error(
        `Repository "${repo}" is private. Please provide a GitHub token with repo permissions.`
      );
    }

    const configPath = '.paymongo';
    const remotePath = 'paymongo-config.json';

    if (direction === 'push' || direction === 'sync') {
      await this.pushConfig(client, owner, repoName, branch, configPath, remotePath, force);
    }

    if (direction === 'pull' || direction === 'sync') {
      await this.pullConfig(client, owner, repoName, branch, configPath, remotePath, force);
    }

    // Update local team config
    await this.updateTeamConfig(repo, branch);
  }

  private async pushConfig(
    client: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    _localPath: string,
    remotePath: string,
    force: boolean
  ): Promise<void> {
    const localConfig = await this.config.load();
    if (!localConfig) {
      throw new Error('No local configuration found. Run "paymongo init" first.');
    }

    // Create sanitized config for sharing (remove sensitive data)
    const shareableConfig = this.sanitizeConfig(localConfig);

    let sha: string | undefined;

    // Check if remote file exists
    try {
      const remoteFile = await client.getFile(owner, repo, remotePath, branch);
      sha = remoteFile.sha;

      if (!force) {
        // Check if remote exists
        const remoteCommits = await client.getCommits(owner, repo, remotePath);
        if (remoteCommits.length > 0) {
          // For now, just warn about potential conflicts
          console.log(`⚠️  Remote config exists. Use --force to overwrite.`);
          return;
        }
      }
    } catch (error) {
      // File doesn't exist, that's fine for push
      if (!(error instanceof Error && error.message.includes('404'))) {
        throw error;
      }
    }

    // Push config to GitHub
    await client.createOrUpdateFile(
      owner,
      repo,
      remotePath,
      JSON.stringify(shareableConfig, null, 2),
      'Update PayMongo CLI configuration',
      branch,
      sha
    );
  }

  private async pullConfig(
    client: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    _localPath: string,
    remotePath: string,
    force: boolean
  ): Promise<void> {
    let remoteFile: GitHubFileContent;

    try {
      remoteFile = await client.getFile(owner, repo, remotePath, branch);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        console.log(`ℹ️  No remote configuration found in ${repo}. Skipping pull.`);
        return;
      }
      throw error;
    }

    if (!remoteFile.content) {
      throw new Error('Remote configuration file is empty.');
    }

    // Decode base64 content
    const remoteConfigContent = Buffer.from(remoteFile.content, 'base64').toString('utf-8');
    let remoteConfig;

    try {
      remoteConfig = JSON.parse(remoteConfigContent);
    } catch (error) {
      throw new Error('Invalid JSON in remote configuration file.');
    }

    // Validate remote config structure
    this.validateRemoteConfig(remoteConfig);

    // Merge with local config
    const localConfig = await this.config.load();
    if (!localConfig) {
      // No local config, use remote as base
      await this.config.save(remoteConfig);
      return;
    }

    if (!force) {
      // Check for conflicts
      const conflicts = this.checkConfigConflicts(localConfig, remoteConfig);
      if (conflicts.length > 0) {
        console.log('⚠️  Configuration conflicts detected:');
        conflicts.forEach((conflict) => console.log(`   - ${conflict}`));
        console.log('Use --force to overwrite local config with remote.');
        return;
      }
    }

    // Merge configurations (remote takes precedence for shared settings)
    const mergedConfig = this.mergeConfigs(localConfig, remoteConfig);
    await this.config.save(mergedConfig);
  }

  private sanitizeConfig(config: any): any {
    // Create a copy without sensitive data
    const sanitized = { ...config };

    // Remove webhook secrets (they should be environment-specific)
    if (sanitized.webhookSecrets) {
      sanitized.webhookSecrets = {};
    }

    // Remove GitHub token (should be set per user)
    if (sanitized.team?.githubToken) {
      delete sanitized.team.githubToken;
    }

    return sanitized;
  }

  private validateRemoteConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error('Remote configuration is not a valid object.');
    }

    if (!config.version) {
      throw new Error('Remote configuration is missing version field.');
    }

    // Add more validation as needed
  }

  private checkConfigConflicts(local: any, remote: any): string[] {
    const conflicts: string[] = [];

    // Check for API key conflicts
    if (
      local.apiKeys?.test?.public &&
      remote.apiKeys?.test?.public &&
      local.apiKeys.test.public !== remote.apiKeys.test.public
    ) {
      conflicts.push('Test environment public API key');
    }

    if (
      local.apiKeys?.test?.secret &&
      remote.apiKeys?.test?.secret &&
      local.apiKeys.test.secret !== remote.apiKeys.test.secret
    ) {
      conflicts.push('Test environment secret API key');
    }

    if (
      local.apiKeys?.live?.public &&
      remote.apiKeys?.live?.public &&
      local.apiKeys.live.public !== remote.apiKeys.live.public
    ) {
      conflicts.push('Live environment public API key');
    }

    if (
      local.apiKeys?.live?.secret &&
      remote.apiKeys?.live?.secret &&
      local.apiKeys.live.secret !== remote.apiKeys.live.secret
    ) {
      conflicts.push('Live environment secret API key');
    }

    return conflicts;
  }

  private mergeConfigs(local: any, remote: any): any {
    // Start with remote as base, then merge local specifics
    const merged = { ...remote };

    // Keep local API keys if they exist (user-specific)
    if (local.apiKeys) {
      merged.apiKeys = { ...merged.apiKeys, ...local.apiKeys };
    }

    // Keep local webhook secrets (environment-specific)
    if (local.webhookSecrets) {
      merged.webhookSecrets = { ...merged.webhookSecrets, ...local.webhookSecrets };
    }

    // Keep local team settings (user-specific)
    if (local.team) {
      merged.team = { ...merged.team, ...local.team };
    }

    return merged;
  }

  private async updateTeamConfig(repo: string, branch: string): Promise<void> {
    let config = await this.config.load();
    if (!config) {
      config = this.config.getDefaultConfig();
    }

    if (!config.team) {
      config.team = {};
    }

    config.team.repo = repo;
    config.team.branch = branch;

    await this.config.save(config);
  }
}

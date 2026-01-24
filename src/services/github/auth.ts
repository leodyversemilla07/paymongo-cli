import { ConfigManager } from '../config/manager';
import { GitHubClient } from './client';

export interface GitHubAuthOptions {
  config: ConfigManager;
}

export class GitHubAuthService {
  private config: ConfigManager;

  constructor(options: GitHubAuthOptions) {
    this.config = options.config;
  }

  async authenticate(token?: string): Promise<GitHubClient> {
    let githubToken = token;

    if (!githubToken) {
      // Try to get from config
      const config = await this.config.load();
      githubToken = config?.team?.githubToken;
    }

    if (!githubToken) {
      throw new Error(
        'GitHub token not found. Please provide a token or run "paymongo team sync --repo owner/repo" to set it up.'
      );
    }

    const client = new GitHubClient({ token: githubToken });

    // Validate token by making a test request
    try {
      await client.getRepo('octocat', 'Hello-World'); // Public repo test
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        throw new Error('Invalid GitHub token. Please check your token and try again.');
      }
      // If it's another error (like network), we can proceed
      // The token might still be valid for private repos
    }

    return client;
  }

  async storeToken(token: string): Promise<void> {
    let config = await this.config.load();
    if (!config) {
      config = this.config.getDefaultConfig();
    }

    if (!config.team) {
      config.team = {};
    }

    config.team.githubToken = token;
    await this.config.save(config);
  }

  async getStoredToken(): Promise<string | undefined> {
    const config = await this.config.load();
    return config?.team?.githubToken;
  }

  async promptForToken(): Promise<string> {
    const inquirer = await import('inquirer');

    const answers = await inquirer.default.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Enter your GitHub Personal Access Token:',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.length < 20) {
            return 'Please enter a valid GitHub token (at least 20 characters)';
          }
          return true;
        },
      },
    ]);

    return answers.token;
  }

  async setupToken(): Promise<string> {
    console.log('🔑 GitHub Authentication Setup');
    console.log('=============================');
    console.log('');
    console.log('To use team features, you need a GitHub Personal Access Token.');
    console.log('You can create one at: https://github.com/settings/tokens');
    console.log('');
    console.log('Required permissions:');
    console.log('• repo (Full control of private repositories)');
    console.log('• workflow (Update GitHub Action workflows)');
    console.log('');
    console.log('The token will be stored securely in your local configuration.');
    console.log('');

    const token = await this.promptForToken();
    await this.storeToken(token);

    console.log('✅ GitHub token stored successfully!');
    return token;
  }
}

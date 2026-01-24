import { Command } from 'commander';
import Spinner from '../../utils/spinner.js';
import chalk from 'chalk';
import { ConfigManager } from '../../services/config/manager.js';
import { GitHubAuthService } from '../../services/github/auth.js';
import { TeamSyncService } from '../../services/github/sync.js';

const command = new Command('team').description('Team collaboration features').showHelpAfterError();

command
  .command('sync')
  .description('Sync configuration with team repository')
  .option('-r, --repo <repo>', 'GitHub repository (owner/repo)')
  .option('-b, --branch <branch>', 'Branch to sync with', 'main')
  .option('-f, --force', 'Force overwrite local/remote config')
  .option('-d, --direction <direction>', 'Sync direction: push, pull, or sync', 'sync')
  .action(async (options) => {
    const spinner = new Spinner();

    try {
      const config = new ConfigManager();
      const auth = new GitHubAuthService({ config });
      const sync = new TeamSyncService({ config, auth });

      // Get repo from options or stored config
      let repo = options.repo;
      if (!repo) {
        const storedConfig = await config.load();
        repo = storedConfig?.team?.repo;
        if (!repo) {
          console.error(chalk.red('❌ No repository specified.'));
          console.log('Use --repo owner/repo or run this command from a project with team config.');
          process.exit(1);
        }
      }

      // Validate direction
      const validDirections = ['push', 'pull', 'sync'];
      if (!validDirections.includes(options.direction)) {
        console.error(chalk.red(`❌ Invalid direction: ${options.direction}`));
        console.log(`Valid directions: ${validDirections.join(', ')}`);
        process.exit(1);
      }

      spinner.start(`Syncing configuration with ${repo}...`);

      await sync.sync({
        repo,
        branch: options.branch,
        force: options.force,
        direction: options.direction,
      });

      spinner.succeed(`Configuration synced with ${repo}!`);
      console.log(chalk.green('✅ Team sync completed successfully'));
    } catch (error) {
      spinner.stop();
      const err = error as Error;

      // Handle specific GitHub auth errors
      if (err.message.includes('GitHub token not found')) {
        console.error(chalk.red('❌ GitHub authentication required'));
        console.log('');
        console.log('To set up GitHub authentication:');
        console.log('1. Create a Personal Access Token at https://github.com/settings/tokens');
        console.log('2. Required permissions: repo (full access to private repos)');
        console.log('3. Run: paymongo team auth --token YOUR_TOKEN');
        console.log('');
        console.log('Or include the token directly:');
        console.log(`paymongo team sync --repo ${options.repo || 'owner/repo'} --token YOUR_TOKEN`);
        process.exit(1);
      }

      console.error(chalk.red('❌ Failed to sync with team:'), err.message);
      process.exit(1);
    }
  });

command
  .command('auth')
  .description('Set up GitHub authentication for team features')
  .option('-t, --token <token>', 'GitHub Personal Access Token')
  .action(async (options) => {
    const spinner = new Spinner();

    try {
      const config = new ConfigManager();
      const auth = new GitHubAuthService({ config });

      let token = options.token;

      if (!token) {
        spinner.start('Setting up GitHub authentication...');
        token = await auth.setupToken();
      } else {
        spinner.start('Storing GitHub token...');
        await auth.storeToken(token);
      }

      spinner.succeed('GitHub authentication configured!');
      console.log(chalk.green('✅ Ready to use team features'));
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to set up authentication:'), err.message);
      process.exit(1);
    }
  });

command
  .command('invite')
  .description('Invite team member to collaborate')
  .arguments('<email>')
  .option('-r, --role <role>', 'Role to assign', 'developer')
  .action(async (email, options) => {
    const spinner = new Spinner();

    try {
      spinner.start(`Inviting ${email} as ${options.role}...`);

      // TODO: Implement invitation system via GitHub
      console.log(chalk.yellow('⚠️  Team invitations coming in next update'));
      console.log(`Would invite ${email} with role: ${options.role}`);
      console.log('For now, share the repository URL manually.');

      spinner.succeed(`Invitation prepared for ${email}!`);
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to send invitation:'), err.message);
      process.exit(1);
    }
  });

command
  .command('members')
  .description('List team members and their roles')
  .action(async () => {
    const spinner = new Spinner();

    try {
      spinner.start('Loading team information...');

      const config = new ConfigManager();
      const storedConfig = await config.load();

      if (!storedConfig?.team?.repo) {
        console.log(chalk.yellow('ℹ️  No team repository configured yet.'));
        console.log('Run "paymongo team sync --repo owner/repo" to set up team collaboration.');
        spinner.stop();
        return;
      }

      console.log(chalk.blue('📋 Team Configuration:'));
      console.log(`Repository: ${storedConfig.team.repo}`);
      console.log(`Branch: ${storedConfig.team.branch || 'main'}`);
      console.log('');
      console.log(chalk.yellow('⚠️  Team member listing coming in next update'));
      console.log('For now, check repository collaborators on GitHub.');

      spinner.succeed('Team information loaded');
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to load team members:'), err.message);
      process.exit(1);
    }
  });

export default command;

import { Command } from 'commander';
import Spinner from '../../utils/spinner.js';
import chalk from 'chalk';
import { ConfigManager } from '../../services/config/manager.js';
import { TeamService } from '../../services/team/service.js';
import { input, confirm } from '@inquirer/prompts';

const command = new Command('team')
  .description('Team collaboration with API key sharing')
  .showHelpAfterError();

command
  .command('share-keys')
  .description('Generate and display shareable API key bundle')
  .option('-e, --env <environments>', 'Environments to share (test,live)', 'test')
  .option('-c, --copy', 'Copy bundle to clipboard (if available)')
  .action(async (options) => {
    const spinner = new Spinner();

    try {
      const config = new ConfigManager();
      const teamService = new TeamService({ config });

      // Parse environments
      const environments = options.env.split(',').map((env: string) => env.trim().toLowerCase());
      const validEnvs = ['test', 'live'];
      const invalidEnvs = environments.filter((env: string) => !validEnvs.includes(env));

      if (invalidEnvs.length > 0) {
        console.error(chalk.red(`❌ Invalid environments: ${invalidEnvs.join(', ')}`));
        console.log(`Valid environments: ${validEnvs.join(', ')}`);
        process.exit(1);
      }

      spinner.start(`Creating key bundle for ${environments.join(', ')}...`);

      const bundle = await teamService.createKeyBundle(environments as ('test' | 'live')[]);

      spinner.succeed('Key bundle created!');

      console.log(chalk.blue('🔑 Shareable API Key Bundle:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(teamService.serializeBundle(bundle));
      console.log(chalk.gray('─'.repeat(50)));
      console.log('');
      console.log(chalk.yellow('📋 Sharing Instructions:'));
      console.log('1. Copy the JSON above');
      console.log('2. Send it securely to your team member');
      console.log('3. They can import it with: paymongo team import-keys');
      console.log('');
      console.log(chalk.gray(`Bundle ID: ${bundle.id}`));
      console.log(chalk.gray(`Created: ${new Date(bundle.createdAt).toLocaleString()}`));
      console.log(chalk.gray(`Environments: ${bundle.environments.join(', ')}`));

      if (options.copy) {
        // Try to copy to clipboard if available
        try {
          const { execSync } = await import('child_process');
          const bundleJson = teamService.serializeBundle(bundle);

          // Try different clipboard commands
          try {
            execSync(`echo '${bundleJson.replace(/'/g, "'\\''")}' | clip`, { stdio: 'pipe' });
            console.log(chalk.green('✅ Copied to clipboard!'));
          } catch {
            try {
              execSync(`echo '${bundleJson.replace(/'/g, "'\\''")}' | xclip -selection clipboard`, {
                stdio: 'pipe',
              });
              console.log(chalk.green('✅ Copied to clipboard!'));
            } catch {
              console.log(chalk.yellow('⚠️  Clipboard copy not available on this system'));
            }
          }
        } catch (_error) {
          console.log(chalk.yellow('⚠️  Clipboard copy not available on this system'));
        }
      }
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to create key bundle:'), err.message);
      process.exit(1);
    }
  });

command
  .command('import-keys')
  .description('Import shared API keys from team member')
  .option('-f, --force', 'Overwrite existing keys without confirmation')
  .action(async (_options) => {
    const spinner = new Spinner();

    try {
      const config = new ConfigManager();
      const teamService = new TeamService({ config });

      // Get bundle from user input
      const bundleJson = await input({
        message: 'Paste the key bundle JSON:',
        validate: (bundleInput: string) => {
          if (!bundleInput.trim()) {
            return 'Please paste the key bundle JSON';
          }
          try {
            JSON.parse(bundleInput);
            return true;
          } catch {
            return 'Invalid JSON format';
          }
        },
      });

      // Get member name
      const memberName = await input({
        message: 'Enter the name of the team member who shared these keys:',
        validate: (nameInput: string) => {
          if (!nameInput.trim()) {
            return 'Please enter a member name';
          }
          return true;
        },
      });

      spinner.start('Importing keys...');

      const bundle = teamService.deserializeBundle(bundleJson);
      await teamService.importKeyBundle(bundle, memberName);

      spinner.succeed('Keys imported successfully!');

      console.log(chalk.green('✅ API keys imported'));
      console.log('');
      console.log(chalk.blue('📋 Import Summary:'));
      console.log(`From: ${memberName}`);
      console.log(`Bundle ID: ${bundle.id}`);
      console.log(`Environments: ${bundle.environments.join(', ')}`);
      console.log(`Imported at: ${new Date().toLocaleString()}`);
      console.log('');
      console.log(chalk.yellow('ℹ️  Next steps:'));
      console.log('• Run "paymongo config list" to see the imported keys');
      console.log('• Test with "paymongo payments list" to verify access');
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to import keys:'), err.message);
      process.exit(1);
    }
  });

command
  .command('list-members')
  .description('List team members and shared keys')
  .action(async () => {
    const spinner = new Spinner();

    try {
      spinner.start('Loading team information...');

      const config = new ConfigManager();
      const teamService = new TeamService({ config });

      const members = await teamService.listMembers();
      const teamInfo = await teamService.getTeamInfo();

      spinner.succeed('Team information loaded');

      console.log(chalk.blue('👥 Team Information:'));
      if (teamInfo.name) {
        console.log(`Name: ${teamInfo.name}`);
      }
      console.log(`Members: ${teamInfo.memberCount}`);
      console.log(`Key Bundles Shared: ${teamInfo.sharedBundlesCount}`);
      console.log(`Environments Available: ${teamInfo.environments.join(', ') || 'none'}`);
      console.log('');

      if (members.length === 0) {
        console.log(chalk.yellow('ℹ️  No team members yet.'));
        console.log('Share keys with "paymongo team share-keys"');
        console.log('Import keys with "paymongo team import-keys"');
        return;
      }

      console.log(chalk.bold('Team Members:'));
      console.log('─'.repeat(70));

      members.forEach((member) => {
        const name = member.name.padEnd(20);
        const email = (member.email || '').padEnd(30);
        const sharedKeys = (member.sharedKeys?.join(', ') || 'none').padEnd(15);
        const addedAt = new Date(member.addedAt).toLocaleDateString();

        console.log(`${name}${email}${sharedKeys}${addedAt}`);
      });

      console.log('');
      console.log(chalk.gray(`Total members: ${members.length}`));
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to load team members:'), err.message);
      process.exit(1);
    }
  });

command
  .command('rename')
  .description('Set or update team name')
  .arguments('<name>')
  .action(async (name) => {
    const spinner = new Spinner();

    try {
      spinner.start('Updating team name...');

      const config = new ConfigManager();
      const teamService = new TeamService({ config });

      await teamService.renameTeam(name);

      spinner.succeed('Team name updated!');
      console.log(chalk.green(`✅ Team renamed to "${name}"`));
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to rename team:'), err.message);
      process.exit(1);
    }
  });

command
  .command('remove-member')
  .description('Remove a team member (does not delete their keys)')
  .arguments('<memberName>')
  .action(async (memberName) => {
    const spinner = new Spinner();

    try {
      // Confirm removal
      const confirmed = await confirm({
        message: `Are you sure you want to remove "${memberName}" from the team?`,
        default: false,
      });

      if (!confirmed) {
        console.log('Operation cancelled.');
        return;
      }

      spinner.start('Removing team member...');

      const config = new ConfigManager();
      const teamService = new TeamService({ config });

      await teamService.removeMember(memberName);

      spinner.succeed('Team member removed');
      console.log(chalk.green(`✅ "${memberName}" removed from team`));
      console.log(chalk.gray('Note: Their API keys remain in your configuration'));
    } catch (error) {
      spinner.stop();
      const err = error as Error;
      console.error(chalk.red('❌ Failed to remove team member:'), err.message);
      process.exit(1);
    }
  });

export default command;

import { Command } from 'commander';
import * as fs from 'fs';
import chalk from 'chalk';
import { DevProcessManager } from '../../services/dev/process-manager.js';

/**
 * Dev logs subcommand - View dev server logs
 */
const logsCommand = new Command('logs')
    .description('View dev server logs')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output (like tail -f)')
    .option('--clear', 'Clear the log file')
    .action(async (options) => {
        if (options.clear) {
            await DevProcessManager.clearLogs();
            console.log(chalk.green('✓ Logs cleared'));
            return;
        }

        const logFile = await DevProcessManager.getLogFile();
        const lines = await DevProcessManager.readLogs(parseInt(options.lines));

        if (lines.length === 0) {
            console.log(chalk.yellow('No logs available.'));
            console.log(chalk.gray('Log file:'), logFile);
            return;
        }

        console.log(chalk.bold('Dev Server Logs'));
        console.log(chalk.gray(`(Last ${lines.length} lines from ${logFile})`));
        console.log(chalk.gray('─'.repeat(60)));
        console.log('');
        lines.forEach((line) => console.log(line));

        if (options.follow) {
            console.log('');
            console.log(chalk.gray('Following logs... Press Ctrl+C to stop'));

            let lastSize = fs.statSync(logFile).size;

            fs.watchFile(logFile, { interval: 500 }, () => {
                const newSize = fs.statSync(logFile).size;
                if (newSize > lastSize) {
                    const fd = fs.openSync(logFile, 'r');
                    const buffer = Buffer.alloc(newSize - lastSize);
                    fs.readSync(fd, buffer, 0, buffer.length, lastSize);
                    fs.closeSync(fd);
                    process.stdout.write(buffer.toString());
                    lastSize = newSize;
                }
            });

            // Keep process running
            await new Promise(() => { });
        }
    });

export default logsCommand;

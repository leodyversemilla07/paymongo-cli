import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import ConfigManager from '../services/config/manager.js';
import Spinner from '../utils/spinner.js';

// Import templates from modular template files
import {
  getJavaScriptWebhookHandler,
  getTypeScriptWebhookHandler,
  getJavaScriptPaymentIntent,
  getTypeScriptPaymentIntent,
  getCheckoutPageTemplate,
} from './generate/templates/index.js';

const command = new Command('generate');

command
  .description('Generate boilerplate code for PayMongo integrations')
  .addHelpText(
    'after',
    `
EXAMPLES
  $ paymongo generate webhook-handler --events payment.paid,payment.failed
  $ paymongo generate webhook-handler --language typescript --framework express
  $ paymongo generate payment-intent --methods card,gcash --language typescript
  $ paymongo generate checkout-page --language react --output Checkout.jsx
`
  )
  .addCommand(
    new Command('webhook-handler')
      .description('Generate a webhook handler for specific events')
      .option(
        '-e, --events <events>',
        'Comma-separated list of events (e.g., payment.paid,payment.failed)'
      )
      .option(
        '-l, --language <language>',
        'Programming language (javascript, typescript)',
        'javascript'
      )
      .option('-f, --framework <framework>', 'Framework (express, fastify, hapi)', 'express')
      .option('-o, --output <file>', 'Output file path')
      .addHelpText(
        'after',
        `
SUPPORTED EVENTS:
  payment.paid, payment.failed, payment.refunded
  source.chargeable
  checkout_session.payment.paid
  qrph.expired

EXAMPLES:
  $ paymongo generate webhook-handler
  $ paymongo generate webhook-handler --events payment.paid,payment.failed
  $ paymongo generate webhook-handler --language typescript --framework fastify
  $ paymongo generate webhook-handler --output my-webhook.js
`
      )
      .action(async (options) => {
        await generateWebhookHandler(options);
      })
  )
  .addCommand(
    new Command('payment-intent')
      .description('Generate payment intent creation code')
      .option(
        '-l, --language <language>',
        'Programming language (javascript, typescript)',
        'javascript'
      )
      .option('-m, --methods <methods>', 'Payment methods (card,gcash,paymaya,grab_pay,qrph)')
      .option('-o, --output <file>', 'Output file path')
      .addHelpText(
        'after',
        `
PAYMENT METHODS:
  card, gcash, paymaya, grab_pay, qrph

EXAMPLES:
  $ paymongo generate payment-intent
  $ paymongo generate payment-intent --methods card,gcash
  $ paymongo generate payment-intent --language typescript --output create-payment.js
`
      )
      .action(async (options) => {
        await generatePaymentIntent(options);
      })
  )
  .addCommand(
    new Command('checkout-page')
      .description('Generate a basic checkout page with PayMongo integration')
      .option('-l, --language <language>', 'Frontend language/framework (html, react, vue)', 'html')
      .option('-o, --output <file>', 'Output file path')
      .addHelpText(
        'after',
        `
FRAMEWORKS:
  html (vanilla HTML/JS), react, vue

EXAMPLES:
  $ paymongo generate checkout-page
  $ paymongo generate checkout-page --framework react
  $ paymongo generate checkout-page --language vue --output Checkout.vue
`
      )
      .action(async (options) => {
        await generateCheckoutPage(options);
      })
  );

async function generateWebhookHandler(options: {
  events?: string;
  language: string;
  framework: string;
  output?: string;
}) {
  const spinner = new Spinner();
  const configManager = new ConfigManager();

  try {
    spinner.start('Loading configuration...');
    const config = await configManager.load();

    if (!config) {
      spinner.fail('No configuration found');
      console.log(chalk.yellow('No PayMongo configuration found.'));
      console.log(chalk.gray("Run 'paymongo init' to set up your project first."));
      return;
    }

    spinner.succeed('Configuration loaded');

    // Get events from options or prompt user
    let events: string[] = [];
    const { input } = await import('@inquirer/prompts');

    if (options.events) {
      events = options.events.split(',').map((e) => e.trim());
    } else {
      const eventInput = await input({
        message: 'Enter webhook events (comma-separated):',
        default: 'payment.paid,payment.failed',
      });
      events = eventInput.split(',').map((e) => e.trim());
    }

    // Validate events
    const validEvents = [
      'payment.paid',
      'payment.failed',
      'payment.refunded',
      'source.chargeable',
      'checkout_session.payment.paid',
      'qrph.expired',
    ];

    const invalidEvents = events.filter((e) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      console.log(chalk.yellow(`Warning: Unknown events: ${invalidEvents.join(', ')}`));
      console.log(chalk.gray(`Valid events: ${validEvents.join(', ')}`));
    }

    // Generate code based on language and framework using extracted templates
    let code: string;
    if (options.language === 'typescript') {
      code = getTypeScriptWebhookHandler(events, options.framework);
    } else {
      code = getJavaScriptWebhookHandler(events, options.framework);
    }

    // Determine output file
    let outputFile = options.output;
    if (!outputFile) {
      const firstEvent = events[0] || 'webhook';
      const defaultName = `webhook-handler-${firstEvent.replace('.', '-')}.${options.language === 'typescript' ? 'ts' : 'js'}`;
      outputFile = await input({
        message: 'Output file path:',
        default: defaultName,
      });
    }

    // Write file
    spinner.start(`Generating webhook handler...`);
    await fs.writeFile(outputFile, code, 'utf-8');
    spinner.succeed(`Webhook handler generated: ${outputFile}`);

    console.log('\n' + chalk.green('✅ Webhook handler generated successfully!'));
    console.log(chalk.gray(`Events handled: ${events.join(', ')}`));
    console.log(chalk.gray(`Language: ${options.language}`));
    console.log(chalk.gray(`Framework: ${options.framework}`));
  } catch (error) {
    spinner.fail('Generation failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }
}

async function generatePaymentIntent(options: {
  language: string;
  methods?: string;
  output?: string;
}) {
  const spinner = new Spinner();

  try {
    // Get payment methods from options or use defaults
    let methods: string[] = ['card', 'gcash', 'paymaya'];
    if (options.methods) {
      methods = options.methods.split(',').map((m) => m.trim());
    }

    // Generate code using extracted templates
    let code: string;
    if (options.language === 'typescript') {
      code = getTypeScriptPaymentIntent(methods);
    } else {
      code = getJavaScriptPaymentIntent(methods);
    }

    // Determine output file
    const { input } = await import('@inquirer/prompts');

    let outputFile = options.output;
    if (!outputFile) {
      const defaultName = `create-payment-intent.${options.language === 'typescript' ? 'ts' : 'js'}`;
      outputFile = await input({
        message: 'Output file path:',
        default: defaultName,
      });
    }

    // Write file
    spinner.start(`Generating payment intent code...`);
    await fs.writeFile(outputFile, code, 'utf-8');
    spinner.succeed(`Payment intent code generated: ${outputFile}`);

    console.log('\n' + chalk.green('✅ Payment intent code generated successfully!'));
    console.log(chalk.gray(`Payment methods: ${methods.join(', ')}`));
    console.log(chalk.gray(`Language: ${options.language}`));
  } catch (error) {
    spinner.fail('Generation failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }
}

async function generateCheckoutPage(options: { language: string; output?: string }) {
  const spinner = new Spinner();

  try {
    // Generate code using extracted templates
    const { code, extension } = getCheckoutPageTemplate(options.language);

    // Determine output file
    const { input } = await import('@inquirer/prompts');

    let outputFile = options.output;
    if (!outputFile) {
      const defaultName = `checkout.${extension}`;
      outputFile = await input({
        message: 'Output file path:',
        default: defaultName,
      });
    }

    // Write file
    spinner.start(`Generating checkout page...`);
    await fs.writeFile(outputFile, code, 'utf-8');
    spinner.succeed(`Checkout page generated: ${outputFile}`);

    console.log('\n' + chalk.green('✅ Checkout page generated successfully!'));
    console.log(chalk.gray(`Framework: ${options.language}`));
  } catch (error) {
    spinner.fail('Generation failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }
}

export default command;

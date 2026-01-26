import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'fs/promises';
import ConfigManager from '../services/config/manager.js';
import Spinner from '../utils/spinner.js';

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
  $ paymongo generate checkout-page --framework react --output Checkout.jsx
`
  )
  .addCommand(
    new Command('webhook-handler')
      .description('Generate a webhook handler for specific events')
      .option('-e, --events <events>', 'Comma-separated list of events (e.g., payment.paid,payment.failed)')
      .option('-l, --language <language>', 'Programming language (javascript, typescript)', 'javascript')
      .option('-f, --framework <framework>', 'Framework (express, fastify, hapi)', 'express')
      .option('-o, --output <file>', 'Output file path')
      .addHelpText(
        'after',
        `
SUPPORTED EVENTS:
  payment.paid, payment.failed, payment.refunded, payment.expired
  source.chargeable, source.failed, source.cancelled
  checkout.session.succeeded, checkout.session.cancelled

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
      .option('-l, --language <language>', 'Programming language (javascript, typescript)', 'javascript')
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
    if (options.events) {
      events = options.events.split(',').map(e => e.trim());
    } else {
      const eventInput = await input({
        message: 'Enter webhook events (comma-separated):',
        default: 'payment.paid,payment.failed',
      });
      events = eventInput.split(',').map(e => e.trim());
    }

    // Validate events
    const validEvents = [
      'payment.paid', 'payment.failed', 'payment.refunded', 'payment.expired',
      'source.chargeable', 'source.failed', 'source.cancelled',
      'checkout.session.succeeded', 'checkout.session.cancelled'
    ];

    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      console.log(chalk.yellow(`Warning: Unknown events: ${invalidEvents.join(', ')}`));
      console.log(chalk.gray(`Valid events: ${validEvents.join(', ')}`));
    }

    // Generate code based on language and framework
    let code: string;
    if (options.language === 'typescript') {
      code = generateTypeScriptWebhookHandler(events, options.framework);
    } else {
      code = generateJavaScriptWebhookHandler(events, options.framework);
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
      methods = options.methods.split(',').map(m => m.trim());
    }

    // Generate code
    let code: string;
    if (options.language === 'typescript') {
      code = generateTypeScriptPaymentIntent(methods);
    } else {
      code = generateJavaScriptPaymentIntent(methods);
    }

    // Determine output file
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

async function generateCheckoutPage(options: {
  language: string;
  output?: string;
}) {
  const spinner = new Spinner();

  try {
    // Generate code based on language/framework
    let code: string;
    let fileExtension: string;

    switch (options.language) {
      case 'react':
        code = generateReactCheckoutPage();
        fileExtension = 'jsx';
        break;
      case 'vue':
        code = generateVueCheckoutPage();
        fileExtension = 'vue';
        break;
      default:
        code = generateHTMLCheckoutPage();
        fileExtension = 'html';
    }

    // Determine output file
    let outputFile = options.output;
    if (!outputFile) {
      const defaultName = `checkout.${fileExtension}`;
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

function generateJavaScriptWebhookHandler(events: string[], framework: string): string {
  const eventHandlers = events.map(event => `
  case '${event}':
    console.log('Processing ${event} event:', data);
    // Add your ${event} handling logic here
    break;`).join('');

  switch (framework) {
    case 'express':
      return `const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signature === \`sha256=\${expectedSignature}\`;
}

app.post('/webhooks/paymongo', (req, res) => {
  try {
    const signature = req.headers['paymongo-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { data } = req.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server running on port \${PORT}\`);
});`;

    case 'fastify':
      return `const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signature === \`sha256=\${expectedSignature}\`;
}

fastify.post('/webhooks/paymongo', async (request, reply) => {
  try {
    const signature = request.headers['paymongo-signature'];
    const payload = JSON.stringify(request.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return reply.code(400).send({ error: 'Invalid signature' });
    }

    const { data } = request.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    return { received: true };
  } catch (error) {
    console.error('Webhook processing error:', error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();`;

    default:
      return `// Simple webhook handler for ${events.join(', ')}

const crypto = require('crypto');

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signature === \`sha256=\${expectedSignature}\`;
}

function handleWebhook(request, response) {
  try {
    const signature = request.headers['paymongo-signature'];
    const payload = JSON.stringify(request.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    const { data } = request.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ received: true }));
  } catch (error) {
    console.error('Webhook processing error:', error);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

module.exports = { handleWebhook };`;
  }
}

function generateTypeScriptWebhookHandler(events: string[], framework: string): string {
  const eventHandlers = events.map(event => `
      case '${event}':
        console.log('Processing ${event} event:', data);
        // Add your ${event} handling logic here
        break;`).join('');

  switch (framework) {
    case 'express':
      return `import express, { Request, Response } from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Webhook secret from PayMongo dashboard
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: any;
    };
  };
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signature === \`sha256=\${expectedSignature}\`;
}

app.post('/webhooks/paymongo', (req: Request, res: Response) => {
  try {
    const signature = req.headers['paymongo-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { data }: PayMongoWebhookPayload = req.body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Webhook server running on port \${PORT}\`);
});`;

    default:
      return `// TypeScript webhook handler for ${events.join(', ')}

import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      type: string;
      livemode: boolean;
      created_at: number;
      updated_at: number;
      data: any;
    };
  };
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signature === \`sha256=\${expectedSignature}\`;
}

export function handleWebhook(body: PayMongoWebhookPayload, signature?: string): { received: boolean } {
  try {
    const payload = JSON.stringify(body);

    // Verify webhook signature (optional but recommended)
    if (WEBHOOK_SECRET && signature && !verifySignature(payload, signature, WEBHOOK_SECRET)) {
      console.log('Invalid signature');
      throw new Error('Invalid signature');
    }

    const { data } = body;
    const eventType = data.attributes.type;

    switch (eventType) {${eventHandlers}
      default:
        console.log('Unhandled event type:', eventType);
    }

    return { received: true };
  } catch (error) {
    console.error('Webhook processing error:', error);
    throw error;
  }
}`;
  }
}

function generateJavaScriptPaymentIntent(methods: string[]): string {
  return `const axios = require('axios');

// PayMongo API credentials
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;

async function createPaymentIntent(amount, currency = 'PHP', description = '') {
  try {
    const response = await axios.post(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: {
            amount: amount, // Amount in centavos (e.g., 10000 = ₱100.00)
            currency: currency,
            description: description,
            payment_method_allowed: ${JSON.stringify(methods)},
          }
        }
      },
      {
        headers: {
          'Authorization': \`Basic \${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}\`,
          'Content-Type': 'application/json',
        }
      }
    );

    const paymentIntent = response.data.data;

    console.log('Payment Intent created:', paymentIntent.id);
    console.log('Client Key:', paymentIntent.attributes.client_key);
    console.log('Amount:', (paymentIntent.attributes.amount / 100).toFixed(2), paymentIntent.attributes.currency);

    return {
      id: paymentIntent.id,
      clientKey: paymentIntent.attributes.client_key,
      amount: paymentIntent.attributes.amount,
      currency: paymentIntent.attributes.currency,
      status: paymentIntent.attributes.status
    };

  } catch (error) {
    console.error('Error creating payment intent:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
async function example() {
  try {
    const paymentIntent = await createPaymentIntent(
      10000, // ₱100.00
      'PHP',
      'Sample payment'
    );

    console.log('Use this client key in your frontend:', paymentIntent.clientKey);

  } catch (error) {
    console.error('Failed to create payment intent');
  }
}

module.exports = { createPaymentIntent };

if (require.main === module) {
  example();
}`;
}

function generateTypeScriptPaymentIntent(methods: string[]): string {
  return `import axios from 'axios';

interface PaymentIntent {
  id: string;
  clientKey: string;
  amount: number;
  currency: string;
  status: string;
}

interface PayMongoPaymentIntentResponse {
  data: {
    id: string;
    attributes: {
      amount: number;
      currency: string;
      description: string;
      status: string;
      client_key: string;
      payment_method_allowed: string[];
    };
  };
}

// PayMongo API credentials
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY!;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY!;

export async function createPaymentIntent(
  amount: number,
  currency: string = 'PHP',
  description: string = ''
): Promise<PaymentIntent> {
  try {
    const response = await axios.post<PayMongoPaymentIntentResponse>(
      'https://api.paymongo.com/v1/payment_intents',
      {
        data: {
          attributes: {
            amount: amount, // Amount in centavos (e.g., 10000 = ₱100.00)
            currency: currency,
            description: description,
            payment_method_allowed: ${JSON.stringify(methods)},
          }
        }
      },
      {
        headers: {
          'Authorization': \`Basic \${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}\`,
          'Content-Type': 'application/json',
        }
      }
    );

    const paymentIntent = response.data.data;

    console.log('Payment Intent created:', paymentIntent.id);
    console.log('Client Key:', paymentIntent.attributes.client_key);
    console.log('Amount:', (paymentIntent.attributes.amount / 100).toFixed(2), paymentIntent.attributes.currency);

    return {
      id: paymentIntent.id,
      clientKey: paymentIntent.attributes.client_key,
      amount: paymentIntent.attributes.amount,
      currency: paymentIntent.attributes.currency,
      status: paymentIntent.attributes.status
    };

  } catch (error: any) {
    console.error('Error creating payment intent:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
async function example(): Promise<void> {
  try {
    const paymentIntent = await createPaymentIntent(
      10000, // ₱100.00
      'PHP',
      'Sample payment'
    );

    console.log('Use this client key in your frontend:', paymentIntent.clientKey);

  } catch (error) {
    console.error('Failed to create payment intent');
  }
}

if (require.main === module) {
  example();
}`;
}

function generateHTMLCheckoutPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayMongo Checkout</title>
  <script src="https://js.paymongo.com/v1/paymongo.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 400px;
      margin: 50px auto;
      padding: 20px;
    }
    .checkout-form {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    input, select {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    }
    button:hover {
      background: #0056b3;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="checkout-form">
    <h2>Complete Your Payment</h2>
    <form id="payment-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" required>
      </div>

      <div class="form-group">
        <label for="card-number">Card Number</label>
        <input type="text" id="card-number" placeholder="1234 5678 9012 3456" required>
      </div>

      <div class="form-group">
        <label for="expiry">Expiry Date</label>
        <input type="text" id="expiry" placeholder="MM/YY" required>
      </div>

      <div class="form-group">
        <label for="cvc">CVC</label>
        <input type="text" id="cvc" placeholder="123" required>
      </div>

      <button type="submit" id="pay-button">Pay ₱100.00</button>
    </form>
  </div>

  <script>
    // Replace with your actual client key from the payment intent
    const clientKey = 'YOUR_CLIENT_KEY_HERE';

    const paymongo = new Paymongo(clientKey);

    document.getElementById('payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const payButton = document.getElementById('pay-button');
      payButton.disabled = true;
      payButton.textContent = 'Processing...';

      try {
        // Create payment method
        const paymentMethod = await paymongo.createPaymentMethod({
          type: 'card',
          details: {
            card_number: document.getElementById('card-number').value.replace(/\\s/g, ''),
            exp_month: document.getElementById('expiry').value.split('/')[0],
            exp_year: '20' + document.getElementById('expiry').value.split('/')[1],
            cvc: document.getElementById('cvc').value,
          },
          billing: {
            email: document.getElementById('email').value,
          },
        });

        // Attach payment method to payment intent
        const result = await paymongo.attachPaymentIntent('YOUR_PAYMENT_INTENT_ID', {
          payment_method: paymentMethod.id,
          return_url: window.location.origin + '/success',
        });

        if (result.next_action) {
          // Handle 3D Secure or other next actions
          window.location.href = result.next_action.redirect.url;
        } else {
          // Payment succeeded
          window.location.href = '/success';
        }

      } catch (error) {
        console.error('Payment failed:', error);
        alert('Payment failed. Please try again.');
        payButton.disabled = false;
        payButton.textContent = 'Pay ₱100.00';
      }
    });
  </script>
</body>
</html>`;
}

function generateReactCheckoutPage(): string {
  return `import React, { useState } from 'react';

interface CheckoutFormProps {
  clientKey: string;
  paymentIntentId: string;
  amount: number;
  onSuccess: (result: any) => void;
  onError: (error: any) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  clientKey,
  paymentIntentId,
  amount,
  onSuccess,
  onError
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    cardNumber: '',
    expiry: '',
    cvc: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Load PayMongo script dynamically if not already loaded
      if (!window.Paymongo) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://js.paymongo.com/v1/paymongo.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const paymongo = new (window as any).Paymongo(clientKey);

      // Create payment method
      const paymentMethod = await paymongo.createPaymentMethod({
        type: 'card',
        details: {
          card_number: formData.cardNumber.replace(/\\s/g, ''),
          exp_month: parseInt(formData.expiry.split('/')[0]),
          exp_year: 2000 + parseInt(formData.expiry.split('/')[1]),
          cvc: formData.cvc,
        },
        billing: {
          email: formData.email,
        },
      });

      // Attach payment method to payment intent
      const result = await paymongo.attachPaymentIntent(paymentIntentId, {
        payment_method: paymentMethod.id,
        return_url: window.location.origin + '/success',
      });

      onSuccess(result);

    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px' }}>
      <div style={{
        background: '#f9f9f9',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h2>Complete Your Payment</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              Card Number
            </label>
            <input
              type="text"
              name="cardNumber"
              value={formData.cardNumber}
              onChange={handleInputChange}
              placeholder="1234 5678 9012 3456"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              Expiry Date
            </label>
            <input
              type="text"
              name="expiry"
              value={formData.expiry}
              onChange={handleInputChange}
              placeholder="MM/YY"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              CVC
            </label>
            <input
              type="text"
              name="cvc"
              value={formData.cvc}
              onChange={handleInputChange}
              placeholder="123"
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Processing...' : \`Pay ₱\${(amount / 100).toFixed(2)}\`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CheckoutForm;`;
}

function generateVueCheckoutPage(): string {
  return `<template>
  <div class="checkout-container">
    <div class="checkout-form">
      <h2>Complete Your Payment</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            v-model="formData.email"
            type="email"
            id="email"
            required
          >
        </div>

        <div class="form-group">
          <label for="cardNumber">Card Number</label>
          <input
            v-model="formData.cardNumber"
            type="text"
            id="cardNumber"
            placeholder="1234 5678 9012 3456"
            required
          >
        </div>

        <div class="form-group">
          <label for="expiry">Expiry Date</label>
          <input
            v-model="formData.expiry"
            type="text"
            id="expiry"
            placeholder="MM/YY"
            required
          >
        </div>

        <div class="form-group">
          <label for="cvc">CVC</label>
          <input
            v-model="formData.cvc"
            type="text"
            id="cvc"
            placeholder="123"
            required
          >
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="pay-button"
        >
          {{ loading ? 'Processing...' : \`Pay ₱\${(amount / 100).toFixed(2)}\` }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CheckoutForm',
  props: {
    clientKey: {
      type: String,
      required: true
    },
    paymentIntentId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      formData: {
        email: '',
        cardNumber: '',
        expiry: '',
        cvc: ''
      }
    };
  },
  methods: {
    async handleSubmit() {
      this.loading = true;

      try {
        // Load PayMongo script if not loaded
        if (!window.Paymongo) {
          await this.loadPayMongoScript();
        }

        const paymongo = new window.Paymongo(this.clientKey);

        // Create payment method
        const paymentMethod = await paymongo.createPaymentMethod({
          type: 'card',
          details: {
            card_number: this.formData.cardNumber.replace(/\\s/g, ''),
            exp_month: parseInt(this.formData.expiry.split('/')[0]),
            exp_year: 2000 + parseInt(this.formData.expiry.split('/')[1]),
            cvc: this.formData.cvc,
          },
          billing: {
            email: this.formData.email,
          },
        });

        // Attach payment method to payment intent
        const result = await paymongo.attachPaymentIntent(this.paymentIntentId, {
          payment_method: paymentMethod.id,
          return_url: window.location.origin + '/success',
        });

        this.$emit('success', result);

      } catch (error) {
        console.error('Payment failed:', error);
        this.$emit('error', error);
      } finally {
        this.loading = false;
      }
    },

    loadPayMongoScript() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.paymongo.com/v1/paymongo.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  }
};
</script>

<style scoped>
.checkout-container {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
}

.checkout-form {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  box-sizing: border-box;
}

.pay-button {
  width: 100%;
  padding: 12px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

.pay-button:hover:not(:disabled) {
  background: #0056b3;
}

.pay-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>`;
}

export default command;
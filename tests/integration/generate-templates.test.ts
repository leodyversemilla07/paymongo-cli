/**
 * Integration tests for generate command templates
 * Verifies all templates generate valid output
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Import templates
import { getWebhookHandlerTemplate as getJsWebhookHandler } from '../../src/commands/generate/templates/webhook-handler/javascript.js';
import { getWebhookHandlerTemplate as getTsWebhookHandler } from '../../src/commands/generate/templates/webhook-handler/typescript.js';
import { getPaymentIntentTemplate as getJsPaymentIntent } from '../../src/commands/generate/templates/payment-intent/javascript.js';
import { getPaymentIntentTemplate as getTsPaymentIntent } from '../../src/commands/generate/templates/payment-intent/typescript.js';
import {
  getCheckoutPageTemplate,
  getHtmlTemplate,
  getReactTemplate,
  getVueTemplate,
} from '../../src/commands/generate/templates/checkout-page/index.js';

describe('Generate Templates Integration', () => {
  const testDir = path.join(os.tmpdir(), 'paymongo-cli-template-tests');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Webhook Handler Templates', () => {
    const events = ['payment.paid', 'payment.failed'];

    it('should generate JavaScript Express webhook handler', async () => {
      const code = getJsWebhookHandler(events, 'express');

      expect(code).toContain("require('express')");
      expect(code).toContain("require('crypto')");
      expect(code).toContain('payment.paid');
      expect(code).toContain('payment.failed');
      expect(code).toContain('verifySignature');
      expect(code).toContain('/webhooks/paymongo');

      // Write to file and verify
      const filePath = path.join(testDir, 'express-webhook.js');
      await fs.writeFile(filePath, code, 'utf-8');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(code);
    });

    it('should generate JavaScript Fastify webhook handler', async () => {
      const code = getJsWebhookHandler(events, 'fastify');

      expect(code).toContain("require('fastify')");
      expect(code).toContain('fastify.post');
      expect(code).toContain('payment.paid');
    });

    it('should generate JavaScript generic webhook handler', async () => {
      const code = getJsWebhookHandler(events, 'generic');

      expect(code).toContain('handleWebhook');
      expect(code).toContain('module.exports');
    });

    it('should generate TypeScript Express webhook handler', async () => {
      const code = getTsWebhookHandler(events, 'express');

      expect(code).toContain('import express');
      expect(code).toContain('Request, Response');
      expect(code).toContain('interface PayMongoWebhookPayload');
      expect(code).toContain('payment.paid');
    });

    it('should generate TypeScript generic webhook handler', async () => {
      const code = getTsWebhookHandler(events, 'generic');

      expect(code).toContain('export function handleWebhook');
      expect(code).toContain('interface PayMongoWebhookPayload');
    });

    it('should include all specified events in handlers', () => {
      const manyEvents = [
        'payment.paid',
        'payment.failed',
        'payment.refunded',
        'source.chargeable',
      ];
      const code = getJsWebhookHandler(manyEvents, 'express');

      manyEvents.forEach((event) => {
        expect(code).toContain(`case '${event}'`);
      });
    });
  });

  describe('Payment Intent Templates', () => {
    const methods = ['card', 'gcash', 'paymaya'];

    it('should generate JavaScript payment intent code', async () => {
      const code = getJsPaymentIntent(methods);

      expect(code).toContain("require('axios')");
      expect(code).toContain('createPaymentIntent');
      expect(code).toContain('PAYMONGO_SECRET_KEY');
      expect(code).toContain(JSON.stringify(methods));
      expect(code).toContain('api.paymongo.com/v1/payment_intents');

      // Write to file and verify
      const filePath = path.join(testDir, 'payment-intent.js');
      await fs.writeFile(filePath, code, 'utf-8');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(code);
    });

    it('should generate TypeScript payment intent code', async () => {
      const code = getTsPaymentIntent(methods);

      expect(code).toContain('import axios');
      expect(code).toContain('interface PaymentIntent');
      expect(code).toContain('interface PayMongoPaymentIntentResponse');
      expect(code).toContain('Promise<PaymentIntent>');
      expect(code).toContain(JSON.stringify(methods));
    });

    it('should include custom payment methods', () => {
      const customMethods = ['card', 'grab_pay', 'qrph'];
      const code = getJsPaymentIntent(customMethods);

      expect(code).toContain(JSON.stringify(customMethods));
    });
  });

  describe('Checkout Page Templates', () => {
    it('should generate HTML checkout page', async () => {
      const { code, extension } = getCheckoutPageTemplate('html');

      expect(extension).toBe('html');
      expect(code).toContain('<!DOCTYPE html>');
      expect(code).toContain('PayMongo Checkout');
      expect(code).toContain('js.paymongo.com/v1/paymongo.js');
      expect(code).toContain('payment-form');
      expect(code).toContain('createPaymentMethod');

      // Write to file and verify
      const filePath = path.join(testDir, 'checkout.html');
      await fs.writeFile(filePath, code, 'utf-8');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(code);
    });

    it('should generate React checkout component', async () => {
      const { code, extension } = getCheckoutPageTemplate('react');

      expect(extension).toBe('jsx');
      expect(code).toContain('import React');
      expect(code).toContain('useState');
      expect(code).toContain('CheckoutFormProps');
      expect(code).toContain('handleSubmit');
      expect(code).toContain('export default CheckoutForm');
    });

    it('should generate Vue checkout component', async () => {
      const { code, extension } = getCheckoutPageTemplate('vue');

      expect(extension).toBe('vue');
      expect(code).toContain('<template>');
      expect(code).toContain('<script>');
      expect(code).toContain('<style scoped>');
      expect(code).toContain('v-model');
      expect(code).toContain("name: 'CheckoutForm'");
    });

    it('should have matching standalone template functions', () => {
      const htmlDirect = getHtmlTemplate();
      const reactDirect = getReactTemplate();
      const vueDirect = getVueTemplate();

      const { code: htmlFromGet } = getCheckoutPageTemplate('html');
      const { code: reactFromGet } = getCheckoutPageTemplate('react');
      const { code: vueFromGet } = getCheckoutPageTemplate('vue');

      expect(htmlDirect).toBe(htmlFromGet);
      expect(reactDirect).toBe(reactFromGet);
      expect(vueDirect).toBe(vueFromGet);
    });

    it('should default to HTML for unknown language', () => {
      const { code, extension } = getCheckoutPageTemplate('unknown');

      expect(extension).toBe('html');
      expect(code).toContain('<!DOCTYPE html>');
    });
  });

  describe('Template File Output', () => {
    it('should write all templates to files successfully', async () => {
      const templates = [
        { name: 'webhook-express.js', code: getJsWebhookHandler(['payment.paid'], 'express') },
        { name: 'webhook-express.ts', code: getTsWebhookHandler(['payment.paid'], 'express') },
        { name: 'payment-intent.js', code: getJsPaymentIntent(['card']) },
        { name: 'payment-intent.ts', code: getTsPaymentIntent(['card']) },
        { name: 'checkout.html', code: getCheckoutPageTemplate('html').code },
        { name: 'Checkout.jsx', code: getCheckoutPageTemplate('react').code },
        { name: 'Checkout.vue', code: getCheckoutPageTemplate('vue').code },
      ];

      for (const template of templates) {
        const filePath = path.join(testDir, template.name);
        await fs.writeFile(filePath, template.code, 'utf-8');

        // Verify file was written
        const stats = await fs.stat(filePath);
        expect(stats.size).toBeGreaterThan(0);

        // Verify content matches
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe(template.code);
      }
    });
  });
});

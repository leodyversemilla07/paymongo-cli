/**
 * Template index - exports all template generators
 */

// Checkout page templates
export {
  getCheckoutPageTemplate,
  getHtmlTemplate,
  getReactTemplate,
  getVueTemplate,
} from './checkout-page/index.js';
// Payment intent templates
export { getPaymentIntentTemplate as getJavaScriptPaymentIntent } from './payment-intent/javascript.js';
export { getPaymentIntentTemplate as getTypeScriptPaymentIntent } from './payment-intent/typescript.js';
// Webhook handler templates
export { getWebhookHandlerTemplate as getJavaScriptWebhookHandler } from './webhook-handler/javascript.js';
export { getWebhookHandlerTemplate as getTypeScriptWebhookHandler } from './webhook-handler/typescript.js';

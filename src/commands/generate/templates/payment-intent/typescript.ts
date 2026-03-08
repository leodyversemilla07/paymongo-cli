/**
 * TypeScript payment intent templates for PayMongo integrations
 */

/**
 * TypeScript payment intent creation template
 */
export function getPaymentIntentTemplate(methods: string[]): string {
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

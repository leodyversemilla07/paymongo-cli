/**
 * Checkout page templates for PayMongo integrations
 */

/**
 * HTML/Vanilla JS checkout page template
 */
export function getHtmlTemplate(): string {
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

/**
 * React checkout component template
 */
export function getReactTemplate(): string {
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

/**
 * Vue checkout component template
 */
export function getVueTemplate(): string {
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

/**
 * Get checkout page template by framework
 */
export function getCheckoutPageTemplate(language: string): { code: string; extension: string } {
    switch (language) {
        case 'react':
            return { code: getReactTemplate(), extension: 'jsx' };
        case 'vue':
            return { code: getVueTemplate(), extension: 'vue' };
        default:
            return { code: getHtmlTemplate(), extension: 'html' };
    }
}

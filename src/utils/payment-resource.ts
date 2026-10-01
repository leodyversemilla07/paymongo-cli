const SENSITIVE_FIELDS = new Set([
  'billing',
  'card_number',
  'cvc',
  'client_key',
  'secret_key',
  'secret',
  'api_key',
]);

/** Remove credentials, raw card fields, and billing PII from diagnostic JSON. */
export function redactPaymentResource(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPaymentResource);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_FIELDS.has(key))
        .map(([key, nested]) => [key, redactPaymentResource(nested)])
    );
  }
  return value;
}

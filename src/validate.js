// Validation and cleanup for one lead. Pure function: no network, no database.
// Returns { ok: true, value } or { ok: false, errors } where errors is { field: message }.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Remove control characters but keep tab, newline and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const LIMITS = { name: 100, email: 254, service: 100, messageMin: 10, message: 2000 };

// Returns the cleaned string, '' when the field is absent, or null when it is not text.
const text = (v) => (v == null ? '' : typeof v === 'string' ? v.replace(CONTROL, '').trim() : null);

export function validateLead(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { body: 'Send a JSON object.' } };
  }
  const errors = {};

  const name = text(input.name);
  if (name === null) errors.name = 'Must be text.';
  else if (!name) errors.name = 'Required.';
  else if (name.length > LIMITS.name) errors.name = `Max ${LIMITS.name} characters.`;

  const email = text(input.email);
  if (email === null) errors.email = 'Must be text.';
  else if (!email) errors.email = 'Required.';
  else if (email.length > LIMITS.email || !EMAIL.test(email)) errors.email = 'Enter a valid email address.';

  const service = text(input.service);
  if (service === null) errors.service = 'Must be text.';
  else if (!service) errors.service = 'Required.';
  else if (service.length > LIMITS.service) errors.service = `Max ${LIMITS.service} characters.`;

  const message = text(input.message);
  if (message === null) errors.message = 'Must be text.';
  else if (!message) errors.message = 'Required.';
  else if (message.length < LIMITS.messageMin) errors.message = `At least ${LIMITS.messageMin} characters.`;
  else if (message.length > LIMITS.message) errors.message = `Max ${LIMITS.message} characters.`;

  // Phone is optional. If given, it needs 7 to 15 digits.
  let phone = '';
  const rawPhone = text(input.phone);
  if (rawPhone === null) errors.phone = 'Must be text.';
  else if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) errors.phone = 'Enter 7 to 15 digits.';
    else phone = rawPhone.startsWith('+') ? '+' + digits : digits;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name.replace(/\s+/g, ' '),
      email: email.toLowerCase(),
      phone,
      service: service.replace(/\s+/g, ' '),
      message,
    },
  };
}

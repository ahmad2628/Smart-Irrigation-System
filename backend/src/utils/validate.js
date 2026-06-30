import { HttpError } from './asyncHandler.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    throw new HttpError(400, `Missing required field(s): ${missing.join(', ')}`);
  }
}

export function assertEmail(email) {
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Invalid email format');
}

export function assertMinLength(value, min, fieldName) {
  if (String(value).length < min) {
    throw new HttpError(400, `${fieldName} must be at least ${min} characters`);
  }
}

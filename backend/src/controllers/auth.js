import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields, assertEmail, assertMinLength } from '../utils/validate.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { createUser, findByEmail, emailExists } from '../repositories/users.js';
import { logActivity } from '../repositories/activityLogs.js';

const sanitize = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  is_active: !!u.is_active,
  created_at: u.created_at,
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  requireFields(req.body, ['name', 'email', 'password']);
  assertEmail(email);
  assertMinLength(password, 6, 'password');

  if (await emailExists(email)) throw new HttpError(409, 'Email already registered');

  // Only an existing admin can create another admin (when authenticated).
  // For first-time setup, role defaults to 'farmer'.
  const finalRole = role === 'admin' && req.user?.role === 'admin' ? 'admin' : 'farmer';

  const passwordHash = await hashPassword(password);
  const user = await createUser({ name, email, passwordHash, role: finalRole });

  await logActivity({
    userId: user.id,
    action: 'register',
    entity: 'user',
    entityId: user.id,
    details: { email },
  });

  res.status(201).json({ user: sanitize(user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  requireFields(req.body, ['email', 'password']);

  const user = await findByEmail(email);
  if (!user) throw new HttpError(401, 'Invalid email or password');
  if (!user.is_active) throw new HttpError(403, 'Account is inactive');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  const token = signToken({ sub: user.id, role: user.role });

  await logActivity({
    userId: user.id,
    action: 'login',
    entity: 'user',
    entityId: user.id,
  });

  res.json({ token, user: sanitize(user) });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

export const logout = asyncHandler(async (req, res) => {
  await logActivity({
    userId: req.user.id,
    action: 'logout',
    entity: 'user',
    entityId: req.user.id,
  });
  res.json({ message: 'Logged out. Discard your token client-side.' });
});

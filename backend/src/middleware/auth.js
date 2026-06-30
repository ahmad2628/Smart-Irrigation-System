import { verifyToken } from '../utils/jwt.js';
import { findById } from '../repositories/users.js';
import { HttpError } from '../utils/asyncHandler.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, 'Missing or invalid Authorization header');
    const decoded = verifyToken(token);
    const user = await findById(decoded.sub);
    if (!user) throw new HttpError(401, 'User no longer exists');
    if (!user.is_active) throw new HttpError(403, 'Account is inactive');
    req.user = user;
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
    next(e);
  }
}

export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  if (!allowed.includes(req.user.role)) {
    return next(new HttpError(403, `Requires role: ${allowed.join(' or ')}`));
  }
  next();
};

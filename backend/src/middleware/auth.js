import jwt from 'jsonwebtoken';
import config from '../config.js';
import User from '../models/User.js';

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from the Authorization header.
 * Attaches `req.user` (the user document) on success.
 * Optional: pass `{ optional: true }` to allow unauthenticated requests through.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a Bearer token.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    // Attach user (without pulling full doc every time for performance)
    req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid token.',
    });
  }
}

/**
 * Optional auth — attaches user if token is valid, but doesn't reject if missing.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
  } catch {
    req.user = null;
  }

  next();
}

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import User from '../models/User.js';
import Session from '../store/Session.js';
import ChatMessage from '../models/ChatMessage.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteCollection } from '../brain/chromaClient.js';

const router = Router();

function signToken(userId, email, name) {
  return jwt.sign({ userId, email, name }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * POST /api/auth/register
 * Create a new user account.
 * Body: { email, password, name }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'email, password, and name are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    // Check for existing user
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      });
    }

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password,
      name: name.trim(),
    });

    const token = signToken(user._id, user.email, user.name);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        created_at: user.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, error: messages.join('; ') });
    }
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Authenticate and receive a JWT token.
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'email and password are required',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const token = signToken(user._id, user.email, user.name);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        created_at: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get the currently authenticated user's profile.
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Count sessions and messages
    const sessionCount = await Session.countDocuments({ user_id: user._id });
    const messageCount = await ChatMessage.countDocuments({ user_id: user._id });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        created_at: user.createdAt,
        session_count: sessionCount,
        message_count: messageCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/account
 * Permanently delete the user account and all associated data.
 */
router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find all user sessions for cleanup
    const userSessions = await Session.find({ user_id: userId });
    const sessionIds = userSessions.map((s) => s.session_id);

    // Delete ChromaDB collections for each session (best-effort)
    for (const sid of sessionIds) {
      try {
        await deleteCollection(sid);
      } catch {
        // ChromaDB may not be available
      }
    }

    // Delete MongoDB records
    await Session.deleteMany({ user_id: userId });
    await ChatMessage.deleteMany({ user_id: userId });
    await User.findByIdAndDelete(userId);

    // Also clean up from in-memory store
    const { deleteSession } = await import('../store/sessionStore.js');
    for (const sid of sessionIds) {
      deleteSession(sid);
    }

    res.status(200).json({ success: true, message: 'Account permanently deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;

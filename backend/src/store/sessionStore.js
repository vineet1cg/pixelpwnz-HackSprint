import config from '../config.js';
import SessionModel from './Session.js';

// In-memory cache for fast reads (LRU-like, auto-expire via TTL check)
const cache = new Map();
const CACHE_TTL_MS = 60_000; // 1 min cache before re-checking MongoDB
let cleanupInterval = null;

/**
 * Create a new user session in MongoDB + cache.
 * @param {string} sessionId
 * @param {object} data - session data (contact_name, pairs, toneProfile, etc.)
 * @param {string|null} userId - optional user ObjectId for auth
 */
export async function createSession(sessionId, data, userId = null) {
  const sessionData = {
    session_id: sessionId,
    user_id: userId,
    ...data,
    created_at: new Date(),
  };

  // Persist to MongoDB
  try {
    await SessionModel.create(sessionData);
  } catch (err) {
    // If duplicate key (session already exists), update instead
    if (err.code === 11000) {
      await SessionModel.updateOne({ session_id: sessionId }, { $set: sessionData });
    } else {
      console.warn('[SessionStore] MongoDB write failed:', err.message);
      // Fall through — cache will still work
    }
  }

  // Cache in memory
  cache.set(sessionId, {
    session_id: sessionId,
    ...data,
    created_at: Date.now(),
    _cachedAt: Date.now(),
  });
}

/**
 * Retrieve a session by ID. Checks in-memory cache first, then MongoDB.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function getSession(sessionId) {
  // 1. Check in-memory cache first (fast path)
  const cached = cache.get(sessionId);
  if (cached) {
    const age = (Date.now() - cached.created_at) / 1000;
    if (age > config.session.ttl) {
      cache.delete(sessionId);
      return null;
    }
    // Return cached but refresh stale cache from DB occasionally
    if (Date.now() - cached._cachedAt < CACHE_TTL_MS) {
      return { ...cached };
    }
  }

  // 2. Check MongoDB
  try {
    const doc = await SessionModel.findOne({ session_id: sessionId }).lean();
    if (!doc) return null;

    const age = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
    if (age > config.session.ttl) {
      await SessionModel.deleteOne({ session_id: sessionId });
      return null;
    }

    // Transform MongoDB doc to match in-memory format
    const result = {
      session_id: doc.session_id,
      user_id: doc.user_id ? doc.user_id.toString() : null,
      contact_name: doc.contact_name || '',
      userName: doc.userName || '',
      label: doc.label || null,
      temperature: doc.temperature ?? 0.7,
      pairs: doc.pairs || [],
      toneProfile: doc.toneProfile || null,
      created_at: new Date(doc.created_at).getTime(),
    };

    // Update cache
    cache.set(sessionId, { ...result, _cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.warn('[SessionStore] MongoDB read failed:', err.message);
    // Fallback: return cached even if stale
    if (cached) return { ...cached };
    return null;
  }
}

/**
 * Delete a session from MongoDB + in-memory cache.
 * @param {string} sessionId
 */
export async function deleteSession(sessionId) {
  cache.delete(sessionId);
  try {
    await SessionModel.deleteOne({ session_id: sessionId });
  } catch (err) {
    console.warn('[SessionStore] MongoDB delete failed:', err.message);
  }
}

/**
 * List all active (non-expired) sessions with summary info.
 * If userId is provided, filters by that user.
 * @param {string|null} userId
 * @returns {Promise<Array>}
 */
export async function listSessions(userId = null) {
  const now = Date.now();
  const results = [];

  // Query MongoDB
  try {
    const filter = {};

    // TTL filter: only return non-expired
    const maxAge = new Date(now - config.session.ttl * 1000);
    filter.created_at = { $gte: maxAge };

    // User filter
    if (userId) {
      filter.user_id = userId;
    }

    const docs = await SessionModel.find(filter)
      .sort({ created_at: -1 })
      .lean()
      .limit(100);

    for (const doc of docs) {
      results.push({
        session_id: doc.session_id,
        contact_name: doc.contact_name || '',
        userName: doc.userName || '',
        label: doc.label || null,
        created_at: new Date(doc.created_at).getTime(),
        pair_count: doc.pairs ? doc.pairs.length : 0,
        toneProfile: doc.toneProfile || null,
      });
    }
  } catch (err) {
    // MongoDB not available — fall back to in-memory cache
    console.warn('[SessionStore] MongoDB list failed, using cache:', err.message);
    const now = Date.now();
    for (const [id, session] of cache) {
      const age = (now - session.created_at) / 1000;
      if (age > config.session.ttl) {
        cache.delete(id);
        continue;
      }
      results.push({
        session_id: id,
        contact_name: session.contact_name || '',
        userName: session.userName || '',
        label: session.label || null,
        created_at: session.created_at,
        pair_count: session.pairs ? session.pairs.length : 0,
        toneProfile: session.toneProfile || null,
      });
    }
    results.sort((a, b) => b.created_at - a.created_at);
  }

  return results;
}

/**
 * Partially update a session's metadata.
 * @param {string} sessionId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateSession(sessionId, updates) {
  const allowedFields = ['label', 'temperature'];

  // Build filtered update
  const filtered = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filtered[field] = updates[field];
    }
  }

  if (Object.keys(filtered).length === 0) {
    return getSession(sessionId);
  }

  // Update MongoDB
  try {
    await SessionModel.updateOne({ session_id: sessionId }, { $set: filtered });
  } catch (err) {
    console.warn('[SessionStore] MongoDB update failed:', err.message);
  }

  // Update in-memory cache
  const cached = cache.get(sessionId);
  if (cached) {
    Object.assign(cached, filtered);
    cached._cachedAt = Date.now();
  }

  return getSession(sessionId);
}

/**
 * Start periodic cleanup of expired sessions from in-memory cache.
 * MongoDB handles its own TTL cleanup via the expireAfterSeconds index.
 */
export function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of cache) {
      const age = (now - session.created_at) / 1000;
      if (age > config.session.ttl) {
        cache.delete(id);
      }
    }
  }, 5 * 60 * 1000);
  cleanupInterval.unref();
}

/**
 * Stop the cleanup interval (for tests).
 */
export function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clear all sessions from cache (for tests).
 */
export function clearAll() {
  cache.clear();
}

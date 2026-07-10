import { Router } from 'express';
import { getSession } from '../store/sessionStore.js';
import { buildRAGPrompt } from '../brain/index.js';
import { generateReply } from '../llm/provider.js';
import { optionalAuth } from '../middleware/auth.js';
import ChatMessage from '../models/ChatMessage.js';

const router = Router();

router.post('/', optionalAuth, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { session_id, incoming_message, message, temperature } = req.body;

    if (!session_id) {
      const err = new Error('Missing session_id');
      err.statusCode = 400;
      throw err;
    }

    // Accept either 'incoming_message' or 'message' (for mobile compatibility)
    const finalMessage = incoming_message || message;
    if (!finalMessage || !finalMessage.trim()) {
      const err = new Error('Missing incoming_message');
      err.statusCode = 400;
      throw err;
    }

    const session = await getSession(session_id);
    if (!session) {
      const err = new Error('Session not found or expired');
      err.statusCode = 404;
      throw err;
    }

    // Save user message to history
    try {
      await ChatMessage.create({
        session_id,
        user_id: req.user?.id || null,
        role: 'user',
        content: finalMessage.trim(),
      });
    } catch {
      // Non-critical — don't block the response
    }

    const {
      systemPrompt,
      userPrompt,
      examples,
    } = await buildRAGPrompt(
      session_id,
      finalMessage,
      session.userName,
      session.pairs
    );

    const { reply, usage, fallback } = await generateReply(
      systemPrompt,
      userPrompt,
      temperature ?? 0.7
    );

    const latencyMs = Date.now() - startTime;

    // Save clone reply to history
    try {
      await ChatMessage.create({
        session_id,
        user_id: req.user?.id || null,
        role: 'clone',
        content: reply,
        token_usage: usage,
        latency_ms: latencyMs,
      });
    } catch {
      // Non-critical
    }

    res.status(200).json({
      success: true,
      reply,
      used_examples: examples.length,
      latency_ms: latencyMs,
      token_usage: usage,
      ...(fallback ? { fallback: true } : {}),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

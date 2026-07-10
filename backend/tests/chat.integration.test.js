import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock the brain module so we don't need ChromaDB/LLM for pipeline tests
vi.mock('../src/brain/index.js', () => ({
  buildRAGPrompt: vi.fn().mockResolvedValue({
    systemPrompt: 'system prompt',
    userPrompt: 'user prompt',
    examples: [],
    latencyMs: 0,
  }),
}));

// Mock the LLM provider to return a controlled response
vi.mock('../src/llm/provider.js', () => ({
  generateReply: vi.fn().mockResolvedValue({
    reply: 'Mocked clone reply',
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    fallback: false,
  }),
}));

import app from '../src/index.js';
import { connectDB, disconnectDB } from '../src/db.js';
import {
  createSession, getSession, clearAll, stopCleanup,
} from '../src/store/sessionStore.js';
import { buildRAGPrompt } from '../src/brain/index.js';
import { generateReply } from '../src/llm/provider.js';

describe('POST /api/chat', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
    vi.clearAllMocks();
    await createSession('test-session-1', {
      contact_name: 'Rishab',
      userName: 'Vineet',
      toneProfile: { avgReplyLength: 5, emojiFrequency: 0.1, formalityLevel: 'Medium' },
      pairs: [{ word_count_out: 5, user_reply: 'Hello', emoji_count: 0 }],
    });
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 400 when session_id is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ incoming_message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('session_id');
  });

  it('returns 400 when incoming_message is missing', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'test-session-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('incoming_message');
  });

  it('returns 404 for invalid session', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'nonexistent', incoming_message: 'Hello' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('accepts message field as alias for incoming_message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'test-session-1', message: 'Hello via alias' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reply).toBe('Mocked clone reply');
  });

  it('accepts incoming_message field (backward compatibility)', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'test-session-1', incoming_message: 'Hello standard' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('prefers incoming_message over message when both are provided', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        session_id: 'test-session-1',
        incoming_message: 'Primary message',
        message: 'Alias message',
      });

    expect(res.status).toBe(200);

    const mockBuildRAGPrompt = vi.mocked(buildRAGPrompt);
    expect(mockBuildRAGPrompt).toHaveBeenCalledWith(
      'test-session-1',
      'Primary message',
      'Vineet',
      expect.any(Object),
    );
  });

  it('calls buildRAGPrompt and generateReply with correct parameters', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'test-session-1', incoming_message: 'Test message', temperature: 0.5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reply).toBe('Mocked clone reply');
    expect(res.body.used_examples).toBe(0);
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.token_usage).toBeDefined();

    const mockBuildRAGPrompt = vi.mocked(buildRAGPrompt);
    expect(mockBuildRAGPrompt).toHaveBeenCalledWith(
      'test-session-1',
      'Test message',
      'Vineet',
      expect.any(Object),
    );

    const mockGenerateReply = vi.mocked(generateReply);
    expect(mockGenerateReply).toHaveBeenCalledWith(
      'system prompt',
      'user prompt',
      0.5,
    );
  });

  it('includes fallback flag when generateReply uses fallback', async () => {
    vi.mocked(generateReply).mockResolvedValueOnce({
      reply: 'Fallback reply',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      fallback: true,
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ session_id: 'test-session-1', incoming_message: 'Hello' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.reply).toBe('Fallback reply');
  });
});

describe('DELETE /api/session/:sessionId', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
    await createSession('del-test', {
      contact_name: 'Test',
      userName: 'User',
      toneProfile: { avgReplyLength: 3, emojiFrequency: 0, formalityLevel: 'Medium' },
      pairs: [],
    });
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 204 on successful deletion', async () => {
    const res = await request(app).delete('/api/session/del-test');
    expect(res.status).toBe(204);
    const session = await getSession('del-test');
    expect(session).toBeNull();
  });

  it('returns 204 even for non-existent sessions', async () => {
    const res = await request(app).delete('/api/session/nonexistent');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/stats/:sessionId', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(() => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns session_exists: false for invalid session', async () => {
    const res = await request(app).get('/api/stats/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.session_exists).toBe(false);
  });

  it('returns stats for valid session', async () => {
    await createSession('stats-test', {
      contact_name: 'Rishab',
      userName: 'Vineet',
      toneProfile: { avgReplyLength: 4, emojiFrequency: 0.2, formalityLevel: 'Medium' },
      pairs: [
        { word_count_out: 5, user_reply: 'Hello', emoji_count: 1 },
        { word_count_out: 3, user_reply: 'Ok', emoji_count: 0 },
      ],
    });

    const res = await request(app).get('/api/stats/stats-test');
    expect(res.status).toBe(200);
    expect(res.body.session_exists).toBe(true);
    expect(res.body.total_pairs).toBe(2);
    expect(res.body.contact_name).toBe('Rishab');
    expect(res.body.avg_reply_length).toBe(4.0);
    expect(res.body.emoji_frequency).toBe(0.5);
  });
});

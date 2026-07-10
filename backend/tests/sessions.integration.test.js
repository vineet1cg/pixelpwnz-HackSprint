import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { connectDB, disconnectDB } from '../src/db.js';
import {
  createSession,
  getSession,
  listSessions,
  clearAll,
  stopCleanup,
} from '../src/store/sessionStore.js';

const makeTestSession = (overrides = {}) => ({
  contact_name: 'Rishab',
  userName: 'Vineet',
  label: null,
  temperature: 0.7,
  toneProfile: {
    avgReplyLength: 5,
    emojiFrequency: 0.1,
    formalityLevel: 'Medium',
    usesCapitalization: true,
    exampleEmojis: ['😂', '👍'],
    punctuation: { usesEllipsis: false, usesExclamation: true, usesQuestion: true, usesAllCaps: false },
    avgSentences: 1.2,
    commonFillers: ['lol'],
  },
  pairs: [
    { id: 'pair-1', incoming_message: 'Hey', user_reply: 'Hello!', timestamp: '2024-01-01T10:00:00Z', word_count_in: 1, word_count_out: 1, emoji_count: 0, contact_name: 'Rishab' },
    { id: 'pair-2', incoming_message: 'How are you?', user_reply: 'Good, you?', timestamp: '2024-01-01T10:01:00Z', word_count_in: 3, word_count_out: 2, emoji_count: 0, contact_name: 'Rishab' },
    { id: 'pair-3', incoming_message: 'Want to grab lunch?', user_reply: 'Sure! 😊', timestamp: '2024-01-01T12:00:00Z', word_count_in: 4, word_count_out: 2, emoji_count: 1, contact_name: 'Rishab' },
    { id: 'pair-4', incoming_message: 'See you at 1', user_reply: 'Cool, cya', timestamp: '2024-01-01T12:30:00Z', word_count_in: 4, word_count_out: 2, emoji_count: 0, contact_name: 'Rishab' },
    { id: 'pair-5', incoming_message: 'Running late', user_reply: 'No worries', timestamp: '2024-01-01T12:45:00Z', word_count_in: 2, word_count_out: 2, emoji_count: 0, contact_name: 'Rishab' },
  ],
  ...overrides,
});

describe('GET /api/sessions', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns empty list when no sessions exist', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(0);
    expect(res.body.sessions).toEqual([]);
  });

  it('returns all active sessions with summary info', async () => {
    await createSession('session-a', makeTestSession({ contact_name: 'Alice' }));
    await createSession('session-b', makeTestSession({ contact_name: 'Bob' }));

    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.sessions).toHaveLength(2);

    const contacts = res.body.sessions.map((s) => s.contact_name);
    expect(contacts).toContain('Alice');
    expect(contacts).toContain('Bob');

    const session = res.body.sessions[0];
    expect(session.session_id).toBeDefined();
    expect(session.contact_name).toBeDefined();
    expect(session.userName).toBeDefined();
    expect(session.created_at).toBeDefined();
    expect(session.pair_count).toBe(5);
    expect(session.toneProfile).toBeDefined();
    expect(session.label).toBeNull();
    expect(session.pairs).toBeUndefined();
  });

  it('filters sessions by search query on contact_name', async () => {
    await createSession('session-a', makeTestSession({ contact_name: 'Alice' }));
    await createSession('session-b', makeTestSession({ contact_name: 'Bob' }));
    await createSession('session-c', makeTestSession({ contact_name: 'Alex' }));

    const res = await request(app).get('/api/sessions?search=ali');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.sessions[0].contact_name).toBe('Alice');
  });

  it('filters sessions by search query on userName', async () => {
    await createSession('session-a', makeTestSession({ userName: 'Vineet' }));
    await createSession('session-b', makeTestSession({ userName: 'Priya' }));

    const res = await request(app).get('/api/sessions?search=pri');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.sessions[0].userName).toBe('Priya');
  });

  it('returns empty results for non-matching search', async () => {
    await createSession('session-a', makeTestSession({ contact_name: 'Alice' }));

    const res = await request(app).get('/api/sessions?search=zxy');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.sessions).toEqual([]);
  });
});

describe('GET /api/sessions/:sessionId', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not found');
  });

  it('returns session details for valid session', async () => {
    const pairs = makeTestSession().pairs;
    await createSession('detail-test', {
      contact_name: 'Rishab',
      userName: 'Vineet',
      toneProfile: makeTestSession().toneProfile,
      pairs,
    });

    const res = await request(app).get('/api/sessions/detail-test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const session = res.body.session;
    expect(session.session_id).toBe('detail-test');
    expect(session.contact_name).toBe('Rishab');
    expect(session.userName).toBe('Vineet');
    expect(session.pair_count).toBe(5);
    expect(session.toneProfile).toBeDefined();
    expect(session.toneProfile.formalityLevel).toBe('Medium');
    expect(session.created_at).toBeGreaterThan(0);
    expect(session.label).toBeNull();
    expect(session.temperature).toBe(0.7);
    expect(session.message_count).toBe(0);
    expect(session.contact_pairs_preview).toHaveLength(3);
    expect(session.contact_pairs_preview[0].incoming_message).toBe('Hey');
  });

  it('handles session with zero pairs gracefully', async () => {
    await createSession('empty-test', {
      contact_name: 'Empty',
      userName: 'User',
      toneProfile: null,
      pairs: [],
    });

    const res = await request(app).get('/api/sessions/empty-test');
    expect(res.status).toBe(200);
    expect(res.body.session.pair_count).toBe(0);
    expect(res.body.session.contact_pairs_preview).toEqual([]);
  });
});

describe('PATCH /api/sessions/:sessionId', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .patch('/api/sessions/nonexistent')
      .send({ label: 'My Label' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when no updatable fields provided', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No updatable fields');
  });

  it('returns 400 for invalid label type', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ label: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('label');
  });

  it('returns 400 for empty label string', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ label: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('label');
  });

  it('returns 400 for label exceeding max length', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ label: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('label');
  });

  it('returns 400 for temperature out of range', async () => {
    await createSession('patch-test', makeTestSession());

    const res1 = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ temperature: -0.1 });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain('temperature');

    const res2 = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ temperature: 2.1 });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('temperature');
  });

  it('returns 400 for non-numeric temperature', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ temperature: 'hot' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('temperature');
  });

  it('successfully updates session label', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ label: 'Work Chat' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.label).toBe('Work Chat');
    expect(res.body.session.contact_name).toBe('Rishab');

    const session = await getSession('patch-test');
    expect(session.label).toBe('Work Chat');
  });

  it('successfully updates session temperature', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ temperature: 1.5 });

    expect(res.status).toBe(200);
    expect(res.body.session.temperature).toBe(1.5);

    const session = await getSession('patch-test');
    expect(session.temperature).toBe(1.5);
  });

  it('updates both label and temperature in one request', async () => {
    await createSession('patch-test', makeTestSession());

    const res = await request(app)
      .patch('/api/sessions/patch-test')
      .send({ label: 'My Chat', temperature: 0.3 });

    expect(res.status).toBe(200);
    expect(res.body.session.label).toBe('My Chat');
    expect(res.body.session.temperature).toBe(0.3);
  });
});

describe('GET /api/sessions/:sessionId/pairs', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/nonexistent/pairs');
    expect(res.status).toBe(404);
  });

  it('returns paginated pairs with default params', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pairs).toHaveLength(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(20);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.total_pages).toBe(1);
    expect(res.body.pagination.has_next).toBe(false);
    expect(res.body.pagination.has_prev).toBe(false);
  });

  it('paginates correctly with small limit', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.total_pages).toBe(3);
    expect(res.body.pagination.has_next).toBe(true);
    expect(res.body.pagination.has_prev).toBe(false);
  });

  it('returns correct page 2 data', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(2);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.has_next).toBe(true);
    expect(res.body.pagination.has_prev).toBe(true);
  });

  it('returns remaining items on last page', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?page=3&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(1);
    expect(res.body.pagination.page).toBe(3);
    expect(res.body.pagination.has_next).toBe(false);
    expect(res.body.pagination.has_prev).toBe(true);
  });

  it('returns empty array for page beyond bounds', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?page=99&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pairs).toEqual([]);
    expect(res.body.pagination.page).toBe(99);
    expect(res.body.pagination.has_next).toBe(false);
  });

  it('enforces limit cap of 100', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('sorts ascending when sort=asc', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs?sort=asc');
    expect(res.status).toBe(200);
    expect(res.body.pairs[0].incoming_message).toBe('Hey');
    expect(res.body.pairs[4].incoming_message).toBe('Running late');
  });

  it('sorts descending by default', async () => {
    await createSession('pairs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/pairs-test/pairs');
    expect(res.status).toBe(200);
    expect(res.body.pairs[0].incoming_message).toBe('Running late');
    expect(res.body.pairs[4].incoming_message).toBe('Hey');
  });
});

describe('GET /api/sessions/:sessionId/messages', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    clearAll();
  });

  afterAll(async () => {
    stopCleanup();
    await disconnectDB();
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app).get('/api/sessions/nonexistent/messages');
    expect(res.status).toBe(404);
  });

  it('returns empty messages array for valid session with no chat history', async () => {
    await createSession('msgs-test', makeTestSession());

    const res = await request(app).get('/api/sessions/msgs-test/messages');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messages).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });
});

describe('GET /api/config', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('returns public configuration', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cfg = res.body.config;
    expect(cfg).toBeDefined();
    expect(cfg.llm_provider).toBeDefined();
    expect(cfg.llm_model).toBeDefined();
    expect(cfg.max_file_size_bytes).toBeGreaterThan(0);
    expect(cfg.max_file_size_mb).toBeGreaterThan(0);
    expect(cfg.session_ttl_seconds).toBeGreaterThan(0);
    expect(cfg.allowed_file_types).toEqual(['.txt']);

    // Must NOT leak API keys
    expect(cfg.openai_api_key).toBeUndefined();
    expect(cfg.api_key).toBeUndefined();
  });
});

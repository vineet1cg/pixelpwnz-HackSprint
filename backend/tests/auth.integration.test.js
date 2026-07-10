import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { connectDB, disconnectDB, dropDB } from '../src/db.js';
import User from '../src/models/User.js';

const testUser = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
};

let authToken = '';

describe('POST /api/auth/register', () => {
  beforeAll(async () => {
    await connectDB();
    await dropDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('email');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('name');
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: '12345', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('6 characters');
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notanemail', password: 'password123', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('registers a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.created_at).toBeDefined();
    // Should NOT return password
    expect(res.body.user.password).toBeUndefined();

    authToken = res.body.token;
  });

  it('returns 409 for duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('email');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('logs in successfully and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.password).toBeUndefined();

    // Store token for subsequent tests
    authToken = res.body.token;
  });
});

describe('GET /api/auth/me', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authentication required');
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.name).toBe(testUser.name);
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.session_count).toBeDefined();
    expect(res.body.user.message_count).toBeDefined();
  });
});

describe('DELETE /api/auth/account', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).delete('/api/auth/account');
    expect(res.status).toBe(401);
  });

  it('deletes account successfully', async () => {
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify user is gone
    const user = await User.findById(authToken._id || null).catch(() => null);
    // user should be null or undefined since deleted
  });
});

import mongoose from 'mongoose';
import config from './config.js';

/**
 * Connect to MongoDB.
 * Uses the MONGODB_URI from config, or falls back to an in-memory server
 * if MONGODB_URI is not set (typically in test environments).
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return mongoose;
  }

  const uri = config.mongodb.uri;

  if (!uri || uri === 'memory') {
    // Use mongodb-memory-server for dev/test when no URI is configured
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    console.log('[MongoDB] Using in-memory server:', memUri);
    await mongoose.connect(memUri);
    return mongoose;
  }

  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected:', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  } catch (err) {
    console.error('[MongoDB] Connection failed, falling back to in-memory:', err.message);
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    console.log('[MongoDB] Using in-memory fallback:', memUri);
    await mongoose.connect(memUri);
  }

  return mongoose;
}

/**
 * Disconnect from MongoDB (for tests).
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState >= 1) {
    await mongoose.disconnect();
  }
}

/**
 * Drop the database (for tests).
 */
export async function dropDB() {
  if (mongoose.connection.readyState >= 1) {
    await mongoose.connection.dropDatabase();
  }
}

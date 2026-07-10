import 'dotenv/config';

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'signet-dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  },

  chroma: {
    host: process.env.CHROMA_HOST || 'localhost',
    port: parseInt(process.env.CHROMA_PORT, 10) || 8000,
  },

  session: {
    ttl: parseInt(process.env.SESSION_TTL, 10) || 3600,
  },

  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 52428800,

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim()),
  },
};

export default config;

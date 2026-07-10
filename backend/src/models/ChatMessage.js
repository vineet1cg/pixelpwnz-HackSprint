import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    index: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  role: {
    type: String,
    enum: ['user', 'clone'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  token_usage: {
    prompt_tokens: { type: Number, default: 0 },
    completion_tokens: { type: Number, default: 0 },
    total_tokens: { type: Number, default: 0 },
  },
  latency_ms: { type: Number, default: 0 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for efficient per-session queries
chatMessageSchema.index({ session_id: 1, createdAt: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;

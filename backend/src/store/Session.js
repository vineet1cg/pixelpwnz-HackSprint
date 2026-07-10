import mongoose from 'mongoose';
import config from '../config.js';

const sessionSchema = new mongoose.Schema({
  session_id: { type: String, required: true, unique: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  contact_name: { type: String, default: '' },
  userName: { type: String, default: '' },
  label: { type: String, default: null },
  temperature: { type: Number, default: 0.7 },
  pairs: { type: Array, default: [] },
  toneProfile: { type: Object, default: null },
  created_at: { type: Date, default: Date.now },
});

// TTL index: auto-delete expired sessions
sessionSchema.index({ created_at: 1 }, { expireAfterSeconds: config.session.ttl });

const Session = mongoose.model('Session', sessionSchema);

export default Session;

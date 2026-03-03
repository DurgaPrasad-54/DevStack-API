const mongoose = require('mongoose');
const teamjoinRequestSchema = new mongoose.Schema({
    sender: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student',
        required: true
    },
    recipient: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student',
        required: true
    },
    teamId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Team',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create a unique index per sender+recipient+team+status so a sender can
// have pending invites to multiple different recipients for the same team.
// This prevents the old behavior where sender+team+status being unique

// blocked invites to different recipients.
teamjoinRequestSchema.index(
  { sender: 1, recipient: 1, teamId: 1, status: 1 },
  { unique: true, name: 'sender_1_recipient_1_teamId_1_status_1' }
);

// Add query-friendly index for recipient/status
teamjoinRequestSchema.index({ recipient: 1, status: 1 }, { name: 'recipient_1_status_1' });

const TeamjoinRequest = mongoose.model('TeamjoinRequest', teamjoinRequestSchema);

// Ensure any old, problematic unique index is removed on startup and the
// correct indexes are present. This runs once mongoose connection opens.
async function _ensureIndexes() {
  try {
    const coll = mongoose.connection.collection(TeamjoinRequest.collection.name);

    // List indexes and drop the old index if it exists
    const existingIndexes = await coll.indexes();
    const oldIndexName = 'sender_1_teamId_1_status_1';
    const foundOld = existingIndexes.some(idx => idx.name === oldIndexName);
    if (foundOld) {
      try {
        await coll.dropIndex(oldIndexName);
        // optional: log removal
        console.warn(`[TeamjoinRequest] dropped old index: ${oldIndexName}`);
      } catch (dropErr) {
        // non-fatal: log and continue
        console.error('[TeamjoinRequest] error dropping old index', dropErr);
      }
    }

    // Create the intended indexes (idempotent if they already exist)
    await coll.createIndex(
      { sender: 1, recipient: 1, teamId: 1, status: 1 },
      { unique: true, name: 'sender_1_recipient_1_teamId_1_status_1' }
    );
    await coll.createIndex({ recipient: 1, status: 1 }, { name: 'recipient_1_status_1' });
  } catch (err) {
    console.error('[TeamjoinRequest] ensureIndexes error', err);
  }
}

if (mongoose.connection.readyState === 1) {
  _ensureIndexes();
} else {
  mongoose.connection.once('open', _ensureIndexes);
}

module.exports = TeamjoinRequest;
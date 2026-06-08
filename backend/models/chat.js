const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'senderModel',
        index: true,
    },
    senderModel: {
        type: String,
        required: true,
        enum: ['Student', 'Mentor', 'Admin']
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
    read: {
        type: Boolean,
        default: false,
        index: true,
    }
});

const chatSchema = new mongoose.Schema({
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'model',
            index: true,
        },
        model: {
            type: String,
            required: true,
            enum: ['Student', 'Mentor', 'Admin']
        }
    }],
    messages: [messageSchema],
    lastMessage: {
        type: Date,
        default: Date.now,
        index: -1, // Descending index for sorting
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    }
});

// Compound index for finding conversations by participants
chatSchema.index({ 'participants.user': 1, 'lastMessage': -1 });

// TTL index for automatic cleanup of inactive chats (optional - 1 year)
chatSchema.index({ lastMessage: 1 }, { expireAfterSeconds: 31536000, sparse: true });

module.exports = mongoose.model('Chat', chatSchema);
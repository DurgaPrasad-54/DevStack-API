const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'senderModel'
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
        default: Date.now
    },
    read: {
        type: Boolean,
        default: false
    }
});

const chatSchema = new mongoose.Schema({
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'model'
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
        default: Date.now
    }
});

module.exports = mongoose.model('Chat', chatSchema);
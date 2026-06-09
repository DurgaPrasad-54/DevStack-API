const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true },
    description: { type: String, required: true },
    meeting: { type: String, default: '' },
    recipients: { 
        type: String, 
        enum: ['all', 'student', 'mentor', 'admin'], 
        default: 'all' 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: false 
    },
    createdByRole: {
        type: String,
        default: 'admin',
    },
    updatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: false 
    }
}, {
    timestamps: true // This automatically adds createdAt and updatedAt fields
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
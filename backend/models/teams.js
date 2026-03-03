// const mongoose = require('mongoose');

// const teamSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     inviteCode: { type: String },
//     students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
//     mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor' }
//   });

// module.exports = mongoose.model('Team', teamSchema);


const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    teamLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    mentor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Mentor',
        default: null 
    }
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
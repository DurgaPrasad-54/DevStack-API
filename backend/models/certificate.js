const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
    title: { type: String, required: true },
    file: { type: Buffer, required: true },
}, { timestamps: true }); // This will add 'createdAt' and 'updatedAt'

const Newsletter = mongoose.model('Newsletter', newsletterSchema);
module.exports = Newsletter;

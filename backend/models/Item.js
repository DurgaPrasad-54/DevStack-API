// models/Item.js
const mongoose = require('mongoose');

// Define the schema for items
const itemSchema = new mongoose.Schema({
    title: { type: String, required: true },
    hyperlink: { type: String, required: true },
    description: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);

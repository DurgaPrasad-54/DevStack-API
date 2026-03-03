const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

// POST: Create a new item
router.post('/', async (req, res) => {
    const { title, hyperlink, description } = req.body;
    try {
        const newItem = new Item({ title, hyperlink, description });
        await newItem.save();
        res.status(201).json(newItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Fetch all items, sorted by `createdAt` in descending order (latest first)
router.get('/', async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 });
        res.status(200).json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: Update an item by ID
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { title, hyperlink, description } = req.body;
    try {
        const updatedItem = await Item.findByIdAndUpdate(
            id,
            { title, hyperlink, description },
            { new: true }
        );
        res.status(200).json(updatedItem);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove an item by ID
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await Item.findByIdAndDelete(id);
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

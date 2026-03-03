// routes/newsletterRoutes.js
const express = require('express');
const multer = require('multer');
const Newsletter = require('../models/certificate'); // Adjust path as necessary
const router = express.Router();

// Use memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Route for uploading the newsletter
router.post('/upload', upload.single('file'), async (req, res) => {
    const title = req.body.title; // Get title from request body
    const file = req.file; // Get the uploaded file

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const newNewsletter = new Newsletter({
            title: title,
            file: file.buffer, // Save the file buffer
        });
        await newNewsletter.save();
        return res.status(200).json({
            message: 'Newsletter uploaded successfully',
            newsletter: newNewsletter,
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to upload newsletter' });
    }
});

// Route for getting all newsletters
router.get('/get', async (req, res) => {
    try {
        const newsletters = await Newsletter.find();
        return res.status(200).json(newsletters);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch newsletters' });
    }
});


router.get('/latest', async (req, res) => {
    try {
        const latestPdf = await Newsletter.findOne().sort({ createdAt: -1 });
        if (!latestPdf) {
            return res.status(404).send('No PDF found');
        }
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${latestPdf.title}.pdf"`,
        });
        res.send(latestPdf.file);
    } catch (error) {
        console.error('Error fetching latest PDF:', error);
        res.status(500).send('Failed to fetch the latest PDF');
    }
});

// Route for getting a newsletter by ID
router.get('/get/:id', async (req, res) => {
    try {
        const newsletter = await Newsletter.findById(req.params.id);
        if (!newsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        res.set('Content-Type', 'application/pdf'); // Set response type
        res.send(newsletter.file); // Send the file buffer
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch newsletter' });
    }
});

// Route for updating a newsletter
router.put('/pdf/:id', upload.single('file'), async (req, res) => {
    const title = req.body.title;
    const file = req.file;

    try {
        const updateData = {
            title: title,
        };

        if (file) {
            updateData.file = file.buffer; // Update the file buffer if a new file is uploaded
        }

        const updatedNewsletter = await Newsletter.findByIdAndUpdate(req.params.id, updateData, { new: true });

        if (!updatedNewsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }

        return res.status(200).json({
            message: 'Newsletter updated successfully',
            newsletter: updatedNewsletter,
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to update newsletter' });
    }
});

// Route for deleting a newsletter
router.delete('/pdf/:id', async (req, res) => {
    try {
        const deletedNewsletter = await Newsletter.findByIdAndDelete(req.params.id);
        if (!deletedNewsletter) {
            return res.status(404).json({ error: 'Newsletter not found' });
        }
        return res.status(200).json({ message: 'Newsletter deleted successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to delete newsletter' });
    }
});

module.exports = router;

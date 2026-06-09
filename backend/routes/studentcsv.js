const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const processStudents = require('../middleware/processcsv'); // Import the processStudents middleware

const router = express.Router();

// Configure multer to use memory storage instead of disk storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/register-students', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const students = [];

  try {
    if (req.file.mimetype === 'text/csv') {
      // Create a readable stream from the buffer in memory
      const stream = Readable.from(req.file.buffer);
      
      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (row) => {
            students.push(row);
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      // Process Excel file directly from buffer
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      students.push(...xlsx.utils.sheet_to_json(sheet));
    } else {
      return res.status(400).json({ error: 'Invalid file format' });
    }

    // Use the imported processStudents function
    const results = await processStudents(students);
    
    res.json({
      message: 'File processed',
      registered: results.registered,
      errors: results.errors,
      existingStudents: results.existingStudents
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file' });
  }
  // No need to clean up file as it's stored in memory
});

module.exports = router;
const express = require('express');
const nodemailer = require('nodemailer');

const router = express.Router();
require('dotenv').config();

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.GMAIL_USER, // use email from .env
      pass: process.env.GMAIL_PASS, // use email password from .env
    },
});
  
router.post('/', (req, res) => {
    const { name, email, subject, message, phone } = req.body; // Added phone to destructuring
    console.log(req.body)

    const mailOptions = {
        from: email,
        to: process.env.GMAIL_USER, // replace with the email you want to receive the form data
        subject: subject,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`, // Added phone to the email body
    };
  
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.status(500).send(error.toString());
        }
        res.status(200).json({ message: 'Email sent: ' + info.response });
        // console.log(info)
    });
});

module.exports = router;
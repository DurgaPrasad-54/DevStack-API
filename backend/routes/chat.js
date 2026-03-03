const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const Chat = require('../models/chat');
const ObjectId = mongoose.Types.ObjectId;

router.get('/users', authenticateToken, async (req, res) => {
    try {
        const { Student, Mentor, Admin } = require('../models/roles');
        
        const students = await Student.find({}, 'name email');
        const mentors = await Mentor.find({}, 'name email');
        const admins = await Admin.find({}, 'name email');

        const allUsers = [
            ...students.map(user => ({ ...user.toObject(), role: 'Student' })),
            ...mentors.map(user => ({ ...user.toObject(), role: 'Mentor' })),
            ...admins.map(user => ({ ...user.toObject(), role: 'Admin' }))
        ].filter(user => user._id.toString() !== req.user.userId);

        res.json(allUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/conversation', authenticateToken, async (req, res) => {
    try {
        const { targetUserId, targetUserModel } = req.body;
        
        if (!targetUserId || !targetUserModel) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const capitalizedRole = targetUserModel.charAt(0).toUpperCase() + targetUserModel.slice(1).toLowerCase();

        let chat = await Chat.findOne({
            'participants': {
                $all: [
                    { $elemMatch: { user: new ObjectId(req.user.userId) } },
                    { $elemMatch: { user: new ObjectId(targetUserId) } }
                ]
            }
        }).populate('participants.user', 'name email');

        if (!chat) {
            chat = new Chat({
                participants: [
                    { user: req.user.userId, model: req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1).toLowerCase() },
                    { user: targetUserId, model: capitalizedRole }
                ],
                messages: []
            });
            await chat.save();
            chat = await chat.populate('participants.user', 'name email');
        }

        res.json(chat);
    } catch (error) {
        console.error('Error creating/getting conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const chats = await Chat.find({
            'participants.user': req.user.userId
        })
        .populate('participants.user', 'name email')
        .sort({ lastMessage: -1 });

        res.json(chats);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/sendmessage', authenticateToken, async (req, res) => {
    try {
        const { chatId, content } = req.body;

        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const senderModel = req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1).toLowerCase();

        const message = {
            sender: req.user.userId,
            senderModel,
            content,
            timestamp: new Date()
        };

        chat.messages.push(message);
        chat.lastMessage = new Date();
        await chat.save();

        chat.participants.forEach(participant => {
            req.app.get('io').to(participant.user.toString()).emit('newMessage', {
                chatId: chat._id,
                message
            });
        });

        res.json({ message: 'Message sent successfully', data: message });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
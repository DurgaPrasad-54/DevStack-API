const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const Chat = require('../models/chat');
const { asyncHandler } = require('../utils/errorHandler');
const ObjectId = mongoose.Types.ObjectId;

// Get all users for chat - CONSOLIDATED QUERY
router.get('/users', authenticateToken, asyncHandler(async (req, res) => {
  const { Student, Mentor, Admin } = require('../models/roles');
  
  // Use Promise.all to fetch in parallel
  const [students, mentors, admins] = await Promise.all([
    Student.find({}, 'name email _id').lean(),
    Mentor.find({}, 'name email _id').lean(),
    Admin.find({}, 'name email _id').lean(),
  ]);

  const allUsers = [
    ...students.map(user => ({ ...user, role: 'Student' })),
    ...mentors.map(user => ({ ...user, role: 'Mentor' })),
    ...admins.map(user => ({ ...user, role: 'Admin' }))
  ].filter(user => user._id.toString() !== req.user.userId);

  res.json({
    success: true,
    data: allUsers,
  });
}));

// Create or get conversation
router.post('/conversation', authenticateToken, asyncHandler(async (req, res) => {
  const { targetUserId, targetUserModel } = req.body;
  
  if (!targetUserId || !targetUserModel) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing targetUserId or targetUserModel' 
    });
  }

  if (!mongoose.Types.ObjectId.isValid(targetUserId) || 
      !mongoose.Types.ObjectId.isValid(req.user.userId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid user ID' 
    });
  }

  const capitalizedRole = targetUserModel.charAt(0).toUpperCase() + 
                         targetUserModel.slice(1).toLowerCase();

  let chat = await Chat.findOne({
    'participants': {
      $all: [
        { $elemMatch: { user: new ObjectId(req.user.userId) } },
        { $elemMatch: { user: new ObjectId(targetUserId) } }
      ]
    }
  }).populate({
    path: 'participants.user',
    select: 'name email',
    options: { lean: true }
  });

  if (!chat) {
    chat = new Chat({
      participants: [
        { 
          user: req.user.userId, 
          model: req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1).toLowerCase() 
        },
        { 
          user: targetUserId, 
          model: capitalizedRole 
        }
      ],
      messages: []
    });
    await chat.save();
    chat = await chat.populate({
      path: 'participants.user',
      select: 'name email',
    });
  }

  res.json({
    success: true,
    data: chat,
  });
}));

// Get all conversations for user - OPTIMIZED
router.get('/conversations', authenticateToken, asyncHandler(async (req, res) => {
  const chats = await Chat.find({
    'participants.user': new ObjectId(req.user.userId)
  })
    .populate({
      path: 'participants.user',
      select: 'name email',
      options: { lean: true }
    })
    .select('participants messages lastMessage')
    .sort({ lastMessage: -1 })
    .lean()
    .limit(100); // Safety limit

  res.json({
    success: true,
    data: chats,
  });
}));

// Send message
router.post('/sendmessage', authenticateToken, asyncHandler(async (req, res) => {
  const { chatId, content } = req.body;

  if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid chat ID' 
    });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ 
      success: false,
      error: 'Message content cannot be empty' 
    });
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    return res.status(404).json({ 
      success: false,
      error: 'Chat not found' 
    });
  }

  const senderModel = req.user.role.charAt(0).toUpperCase() + 
                     req.user.role.slice(1).toLowerCase();

  const message = {
    sender: req.user.userId,
    senderModel,
    content: content.trim(),
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
}));

module.exports = router;
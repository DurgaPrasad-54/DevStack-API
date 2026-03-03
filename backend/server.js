const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const Chat = require('./models/chat');
const path = require("path")


// Load environment variables
dotenv.config();

const pdfRoutes = require('./routes/certificates');
const UserRoutes = require('./routes/roles');
const csvRoutes = require('./routes/studentcsv');
const EventRoutes = require('./routes/eventRoutes');
const Teams = require('./routes/teams');
const Contact = require('./routes/contactus');
const Profile = require('./routes/profile');
const notificationRoutes = require('./routes/notification');
const Project = require('./routes/projects');
const teamdata = require('./routes/teamformation');
const teammentor = require('./routes/mentor-assign');
const itemRoutes = require('./routes/item');
const notesRoutes = require('./routes/notes');
const videoRoutes = require('./routes/video');
const examsRoute = require('./routes/examsRoute');
const reportsRoute = require('./routes/reportsRoute');
const chatRoutes = require('./routes/chat');
const taskRoutes = require('./routes/taskRoutes');
const Activetime = require('./routes/Activetime');
const mentorApproval = require('./routes/mentorapproval');
const maincertificate = require('./routes/main-certificates');
const promotingStudents = require('./routes/promotingstudents');
const mentorEvents = require('./routes/mentorevents');
const Adminresourceapproval = require('./routes/resouresapprovalbyadmin');
// const secondYearRequest = require('./routes/secondyearrequest');
const hackathon = require("./Devstack/routes/Adminhackathon");
const HackNotification = require('./Devstack/Models/HackNotification');
const { startHackathonStatusScheduler } = require('./Devstack/scheduler/hackathonStatusScheduler');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for WebSocket
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  },
});

// Middleware
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(
  cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.set('io', io);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB connected...');
    // Start hackathon status scheduler AFTER MongoDB is connected
    startHackathonStatusScheduler();
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Store connected users
const connectedUsers = new Map();

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication token missing'));
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (error) {
    next(new Error('Invalid token: ' + error.message));
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId} (Socket ID: ${socket.id})`);

  // Store multiple connections per user
  if (!connectedUsers.has(socket.userId)) {
    connectedUsers.set(socket.userId, new Set());
  }
  connectedUsers.get(socket.userId).add(socket.id);

  // Join user room for direct messages
  socket.join(socket.userId);

  // Send confirmation to client
  socket.emit('connected', {
    userId: socket.userId,
    socketId: socket.id,
  });

  socket.on('sendMessage', async (data, callback) => {
    try {
      if (!data || !data.chatId || !data.message || !data.message.content) {
        throw new Error('Invalid message data');
      }

      const chat = await Chat.findById(data.chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const capitalizedRole =
        socket.userRole.charAt(0).toUpperCase() +
        socket.userRole.slice(1).toLowerCase();

      const newMessage = {
        sender: socket.userId,
        senderModel: capitalizedRole,
        content: data.message.content,
        timestamp: new Date(),
      };
      console.log('New message:', newMessage);

      chat.messages.push(newMessage);
      chat.lastMessage = new Date();
      await chat.save();

      // Emit to each participant's room instead of individual sockets
      for (const participant of chat.participants) {
        const participantId = participant.user.toString();
        console.log(`Emitting message to participant: ${participantId}`);

        // Send to user's room (all their devices)
        io.to(participantId).emit('newMessage', {
          chatId: chat._id,
          message: newMessage,
        });
      }

      // Send acknowledgment back to sender
      if (callback) callback({ success: true });
    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', { message: error.message });
      if (callback) callback({ error: error.message });
    }
  });
  socket.on('markAsRead', async (notificationId) => {
  try {
    await HackNotification.findByIdAndUpdate(notificationId, {
      $addToSet: { readBy: socket.userId }
    });

    // Optionally notify only that user
    io.to(socket.userId).emit('notificationRead', { notificationId });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
});
socket.on('markHackAsRead', async (hackNotificationId) => {
  try {
    await HackNotification.findByIdAndUpdate(hackNotificationId, {
      $addToSet: { readBy: socket.userId }
    });

    // Notify only this user
    io.to(socket.userId).emit('hackNotificationRead', { hackNotificationId });
  } catch (error) {
    console.error('Error marking hackathon notification as read:', error);
    socket.emit('error', { message: error.message });
  }
});
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);

    // Remove this specific connection
    if (connectedUsers.has(socket.userId)) {
      connectedUsers.get(socket.userId).delete(socket.id);

      // If no more connections for this user, remove from map
      if (connectedUsers.get(socket.userId).size === 0) {
        connectedUsers.delete(socket.userId);
      }
    }
  });
});

// Define API routes
app.use('/pdf', pdfRoutes);
app.use('/roles', UserRoutes);
app.use('/csv', csvRoutes);
app.use('/api', EventRoutes);
app.use('/teams', Teams);
app.use('/teamformation', teamdata);
app.use('/mentor', teammentor);
app.use('/contact', Contact);
app.use('/profile', Profile);
app.use('/notifications', notificationRoutes);
app.use('/projects', Project);
app.use('/items', itemRoutes);
app.use('/notes', notesRoutes);
app.use('/videos', videoRoutes);
app.use('/api/exams', examsRoute);
app.use('/api/reports', reportsRoute);
app.use('/chat', chatRoutes);
app.use('/api', taskRoutes);
app.use('/activetime', Activetime);
app.use('/mentor-approval', mentorApproval);
app.use('/api/certificates', maincertificate);
app.use('/api/generated-programs', maincertificate);
app.use('/promoting-students', promotingStudents);
app.use('/feedback', require('./routes/feedback'));
app.use('/mentorevents', mentorEvents);
app.use('/mentorresources', require('./routes/mentorresources'));
app.use('/admin-approvals', Adminresourceapproval);
// app.use('/secondyear-change', secondYearRequest);
app.use("/hackathon", hackathon);
app.use('/hacknotifications', require('./Devstack/routes/HackNotification'));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
 app.use('/roomallocation', require('./Devstack/routes/roomallocation'));
 app.use('/schedule', require('./Devstack/routes/schedule'));
 app.use('/hackreg', require('./Devstack/routes/hack-reg'));
app.use('/hackitems', require('./Devstack/routes/Hackitems'));
app.use('/hacknotes', require('./Devstack/routes/Hacknotes'));
app.use('/hackvideos', require('./Devstack/routes/Hackvideos'));
app.use('/hackvideofolder', require('./Devstack/routes/Hackvideofolder'));
app.use('/hackfolder', require('./Devstack/routes/Hackfolder'));
app.use('/hackathonrequests', require('./Devstack/routes/Hackmentor'));
app.use('/hackteams', require('./Devstack/routes/hackteam'));
app.use('/problemstatements', require('./Devstack/routes/problemstatements'));
app.use('/studenthackteam', require('./Devstack/routes/studenthackteam'));
app.use('/teamprogress', require('./Devstack/routes/teamprogress'));
app.use('/hacksubmission', require('./Devstack/routes/hacksubmission'));
app.use('/hackmentorfeedback', require('./Devstack/routes/hackfeedbackmentor'));
app.use('/hackathonattendance', require('./Devstack/routes/hackathonattendance'));
app.use('/mentorevaluation', require('./Devstack/routes/mentorEvaluation'));
app.use('/api/hackathon/gallery', require('./Devstack/routes/hackGallery'));
app.use('/winners', require('./Devstack/routes/Winners'));
app.use('/hackcertificates', require('./Devstack/routes/HackCertificate'));
app.use('/hackathon-history', require('./Devstack/routes/hackathonHistory'));
app.use('/mentor-hackathon-history', require('./Devstack/routes/mentorHackathonHistory'));

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

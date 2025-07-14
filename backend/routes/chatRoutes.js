const express = require('express');
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// All chat routes require authentication
router.use(verifyToken);

// Chat room management
router.post('/group-planning', chatController.createGroupPlanningChat);
router.post('/location', chatController.joinLocationChat);
router.post('/qa', chatController.createQAChat);

// Chat history and participants
router.get('/room/:roomId/history', chatController.getChatHistory);
router.get('/room/:roomId/participants', chatController.getChatParticipants);

// Message management (HTTP alternative to Socket.IO)
router.post('/messages', chatController.sendMessage);
router.put('/messages/:messageId', chatController.editMessage);
router.delete('/messages/:messageId', chatController.deleteMessage);

// Message interactions
router.post('/messages/:messageId/reactions', chatController.addReaction);
router.delete('/messages/:messageId/reactions', chatController.removeReaction);

// Read receipts
router.post('/room/:roomId/read', chatController.markMessagesAsRead);

// User's chats overview
router.get('/my-chats', chatController.getUserChats);

module.exports = router;

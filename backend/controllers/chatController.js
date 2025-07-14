const chatService = require('../services/chatService');
const journeyService = require('../services/journeyService');
const Logger = require('../utils/logger');

class ChatController {
  // Get chat history
  async getChatHistory(req, res, next) {
    try {
      const { roomId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const userId = req.user.userId;

      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID is required'
        });
      }

      // TODO: Add room access validation here
      // For now, we'll trust that the user has access to the room

      const result = await chatService.getChatHistory(
        roomId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        roomId,
        ...result
      });

    } catch (error) {
      Logger.error('Failed to get chat history', { 
        roomId: req.params.roomId, 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Create group planning chat
  async createGroupPlanningChat(req, res, next) {
    try {
      const { journeyId } = req.body;
      const creatorId = req.user.userId;

      if (!journeyId) {
        return res.status(400).json({
          success: false,
          message: 'Journey ID is required'
        });
      }

      const result = await chatService.createGroupPlanningChat(journeyId, creatorId);

      Logger.info('Group planning chat created', { 
        journeyId, 
        creatorId, 
        chatRoom: result.chatRoom 
      });

      res.status(201).json(result);

    } catch (error) {
      Logger.error('Failed to create group planning chat', { 
        journeyId: req.body.journeyId, 
        creatorId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Only journey creator can create group chat') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Join location-based chat
  async joinLocationChat(req, res, next) {
    try {
      const { name, coordinates } = req.body;
      const userId = req.user.userId;

      if (!name || !coordinates || !coordinates.latitude || !coordinates.longitude) {
        return res.status(400).json({
          success: false,
          message: 'Location name and coordinates (latitude, longitude) are required'
        });
      }

      // Validate coordinates
      const { latitude, longitude } = coordinates;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinates provided'
        });
      }

      const result = await chatService.createLocationChat(
        { name, coordinates }, 
        userId
      );

      Logger.info('Location chat joined', { 
        location: name, 
        coordinates, 
        userId, 
        chatRoom: result.chatRoom 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to join location chat', { 
        locationData: req.body, 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Create Q&A chat with journey creator
  async createQAChat(req, res, next) {
    try {
      const { journeyId } = req.body;
      const askerId = req.user.userId;

      if (!journeyId) {
        return res.status(400).json({
          success: false,
          message: 'Journey ID is required'
        });
      }

      const result = await chatService.createQAChat(journeyId, askerId);

      Logger.info('Q&A chat created', { 
        journeyId, 
        askerId, 
        chatRoom: result.chatRoom 
      });

      res.status(201).json(result);

    } catch (error) {
      Logger.error('Failed to create Q&A chat', { 
        journeyId: req.body.journeyId, 
        askerId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Cannot create Q&A chat with yourself') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Mark messages as read
  async markMessagesAsRead(req, res, next) {
    try {
      const { roomId } = req.params;
      const { messageIds = [] } = req.body;
      const userId = req.user.userId;

      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID is required'
        });
      }

      const result = await chatService.markMessagesAsRead(roomId, userId, messageIds);

      Logger.info('Messages marked as read', { 
        roomId, 
        userId, 
        messagesCount: result.messagesMarked 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to mark messages as read', { 
        roomId: req.params.roomId, 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Add reaction to message
  async addReaction(req, res, next) {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;
      const userId = req.user.userId;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: 'Message ID is required'
        });
      }

      if (!emoji || emoji.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Emoji is required'
        });
      }

      // Basic emoji validation (you might want to use a more comprehensive emoji library)
      if (emoji.length > 10) {
        return res.status(400).json({
          success: false,
          message: 'Invalid emoji format'
        });
      }

      const result = await chatService.addReaction(messageId, userId, emoji.trim());

      Logger.info('Reaction added to message', { 
        messageId, 
        userId, 
        emoji: emoji.trim() 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to add reaction', { 
        messageId: req.params.messageId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Message not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Remove reaction from message
  async removeReaction(req, res, next) {
    try {
      const { messageId } = req.params;
      const userId = req.user.userId;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: 'Message ID is required'
        });
      }

      const result = await chatService.removeReaction(messageId, userId);

      Logger.info('Reaction removed from message', { 
        messageId, 
        userId 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to remove reaction', { 
        messageId: req.params.messageId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Message not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Edit message
  async editMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user.userId;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: 'Message ID is required'
        });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      if (content.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Message cannot exceed 1000 characters'
        });
      }

      const result = await chatService.editMessage(messageId, userId, content.trim());

      Logger.info('Message edited', { 
        messageId, 
        userId 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to edit message', { 
        messageId: req.params.messageId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Message not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Can only edit your own messages') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Delete message
  async deleteMessage(req, res, next) {
    try {
      const { messageId } = req.params;
      const userId = req.user.userId;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: 'Message ID is required'
        });
      }

      const result = await chatService.deleteMessage(messageId, userId);

      Logger.info('Message deleted', { 
        messageId, 
        userId 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to delete message', { 
        messageId: req.params.messageId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Message not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Can only delete your own messages') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Get user's active chats
  async getUserChats(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20 } = req.query;

      const result = await chatService.getUserChats(
        userId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      Logger.error('Failed to get user chats', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get chat participants
  async getChatParticipants(req, res, next) {
    try {
      const { roomId } = req.params;
      const userId = req.user.userId;

      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'Room ID is required'
        });
      }

      // TODO: Add room access validation here

      const participants = await chatService.getChatParticipants(roomId);

      res.json({
        success: true,
        roomId,
        participants
      });

    } catch (error) {
      Logger.error('Failed to get chat participants', { 
        roomId: req.params.roomId, 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Send message via HTTP (alternative to Socket.IO)
  async sendMessage(req, res, next) {
    try {
      const { roomId, content, messageType = 'text', parentMessageId } = req.body;
      const userId = req.user.userId;

      if (!roomId || !content) {
        return res.status(400).json({
          success: false,
          message: 'Room ID and content are required'
        });
      }

      if (content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Message content cannot be empty'
        });
      }

      if (content.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Message cannot exceed 1000 characters'
        });
      }

      // Determine chat type based on room ID
      let chatType = 'direct';
      if (roomId.startsWith('journey_')) chatType = 'group_planning';
      else if (roomId.startsWith('location_')) chatType = 'location_chat';
      else if (roomId.startsWith('qa_')) chatType = 'qa_chat';

      const messageData = {
        sender: userId,
        content: content.trim(),
        messageType,
        chatRoom: roomId,
        chatType,
        parentMessage: parentMessageId || null
      };

      const savedMessage = await chatService.saveMessage(messageData);

      Logger.info('Message sent via HTTP', { 
        messageId: savedMessage._id, 
        userId, 
        roomId, 
        messageType 
      });

      res.status(201).json({
        success: true,
        message: savedMessage
      });

    } catch (error) {
      Logger.error('Failed to send message via HTTP', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }
}

module.exports = new ChatController();

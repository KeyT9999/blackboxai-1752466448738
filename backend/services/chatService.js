const Message = require('../models/messageModel');
const Journey = require('../models/journeyModel');
const User = require('../models/userModel');
const { setCache, getCache, deleteCache, publishMessage } = require('../utils/redisClient');
const Logger = require('../utils/logger');

class ChatService {
  // Save message to database
  async saveMessage(messageData) {
    const startTime = Date.now();
    
    try {
      const message = new Message(messageData);
      await message.save();
      await message.populate('sender', 'username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'messages', duration);
      Logger.chatMessage(messageData.chatRoom, messageData.sender, messageData.messageType);

      // Publish to Redis for real-time distribution
      await publishMessage(`chat:${messageData.chatRoom}`, {
        type: 'new_message',
        message: message
      });

      return message;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'messages', duration, error);
      throw error;
    }
  }

  // Get chat history
  async getChatHistory(chatRoom, page = 1, limit = 50) {
    const startTime = Date.now();
    
    try {
      const cacheKey = `chat_history:${chatRoom}:${page}:${limit}`;
      const cachedHistory = await getCache(cacheKey);
      
      if (cachedHistory) {
        Logger.debug('Chat history served from cache', { chatRoom, page });
        return cachedHistory;
      }

      const skip = (page - 1) * limit;
      
      const messages = await Message.find({
        chatRoom,
        isDeleted: false
      })
      .populate('sender', 'username firstName lastName avatar')
      .populate('parentMessage', 'content sender')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

      const total = await Message.countDocuments({
        chatRoom,
        isDeleted: false
      });

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration);

      const result = {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalMessages: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

      // Cache for 5 minutes
      await setCache(cacheKey, result, 300);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration, error);
      throw error;
    }
  }

  // Create group planning chat room
  async createGroupPlanningChat(journeyId, creatorId) {
    const startTime = Date.now();
    
    try {
      // Verify journey exists and user has permission
      const journey = await Journey.findById(journeyId);
      if (!journey) {
        throw new Error('Journey not found');
      }

      if (journey.creator.toString() !== creatorId) {
        throw new Error('Only journey creator can create group chat');
      }

      const chatRoom = `journey_${journeyId}`;
      
      // Create welcome message
      const welcomeMessage = await this.saveMessage({
        sender: creatorId,
        content: `Welcome to the planning chat for "${journey.title}"! Let's collaborate on this amazing journey.`,
        messageType: 'system',
        chatRoom,
        chatType: 'group_planning',
        journeyId,
        systemData: {
          action: 'chat_created',
          data: { journeyTitle: journey.title }
        }
      });

      const duration = Date.now() - startTime;
      Logger.info('Group planning chat created', { journeyId, chatRoom, duration: `${duration}ms` });

      return {
        success: true,
        chatRoom,
        welcomeMessage
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error('Failed to create group planning chat', { 
        journeyId, 
        error: error.message, 
        duration: `${duration}ms` 
      });
      throw error;
    }
  }

  // Create location-based chat room
  async createLocationChat(locationData, userId) {
    const startTime = Date.now();
    
    try {
      const { name, coordinates } = locationData;
      const chatRoom = `location_${coordinates.latitude}_${coordinates.longitude}`;
      
      // Check if user is actually at this location (optional validation)
      // This could be enhanced with geofencing logic
      
      const duration = Date.now() - startTime;
      Logger.info('Location chat accessed', { 
        location: name, 
        chatRoom, 
        userId, 
        duration: `${duration}ms` 
      });

      return {
        success: true,
        chatRoom,
        location: { name, coordinates }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error('Failed to create location chat', { 
        locationData, 
        error: error.message, 
        duration: `${duration}ms` 
      });
      throw error;
    }
  }

  // Create Q&A chat with journey creator
  async createQAChat(journeyId, askerId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId).populate('creator', 'username firstName lastName');
      if (!journey) {
        throw new Error('Journey not found');
      }

      if (journey.creator._id.toString() === askerId) {
        throw new Error('Cannot create Q&A chat with yourself');
      }

      const chatRoom = `qa_${journeyId}_${askerId}`;
      
      const duration = Date.now() - startTime;
      Logger.info('Q&A chat created', { 
        journeyId, 
        askerId, 
        creatorId: journey.creator._id, 
        chatRoom, 
        duration: `${duration}ms` 
      });

      return {
        success: true,
        chatRoom,
        journey: {
          id: journey._id,
          title: journey.title,
          creator: journey.creator
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error('Failed to create Q&A chat', { 
        journeyId, 
        askerId, 
        error: error.message, 
        duration: `${duration}ms` 
      });
      throw error;
    }
  }

  // Mark messages as read
  async markMessagesAsRead(chatRoom, userId, messageIds = []) {
    const startTime = Date.now();
    
    try {
      let query = { chatRoom, 'readBy.user': { $ne: userId } };
      
      if (messageIds.length > 0) {
        query._id = { $in: messageIds };
      }

      const result = await Message.updateMany(
        query,
        { $push: { readBy: { user: userId } } }
      );

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration);

      // Clear chat history cache
      await deleteCache(`chat_history:${chatRoom}*`);

      // Publish read receipt
      await publishMessage(`chat:${chatRoom}`, {
        type: 'messages_read',
        userId,
        messageIds: messageIds.length > 0 ? messageIds : 'all'
      });

      return {
        success: true,
        messagesMarked: result.modifiedCount
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration, error);
      throw error;
    }
  }

  // Add reaction to message
  async addReaction(messageId, userId, emoji) {
    const startTime = Date.now();
    
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      await message.addReaction(userId, emoji);

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration);

      // Clear cache and publish update
      await deleteCache(`chat_history:${message.chatRoom}*`);
      await publishMessage(`chat:${message.chatRoom}`, {
        type: 'reaction_added',
        messageId,
        userId,
        emoji
      });

      return {
        success: true,
        message: 'Reaction added successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration, error);
      throw error;
    }
  }

  // Remove reaction from message
  async removeReaction(messageId, userId) {
    const startTime = Date.now();
    
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      await message.removeReaction(userId);

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration);

      // Clear cache and publish update
      await deleteCache(`chat_history:${message.chatRoom}*`);
      await publishMessage(`chat:${message.chatRoom}`, {
        type: 'reaction_removed',
        messageId,
        userId
      });

      return {
        success: true,
        message: 'Reaction removed successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration, error);
      throw error;
    }
  }

  // Edit message
  async editMessage(messageId, userId, newContent) {
    const startTime = Date.now();
    
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      if (message.sender.toString() !== userId) {
        throw new Error('Can only edit your own messages');
      }

      // Store original content
      if (!message.originalContent) {
        message.originalContent = message.content;
      }

      message.content = newContent;
      message.editedAt = new Date();
      await message.save();

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration);

      // Clear cache and publish update
      await deleteCache(`chat_history:${message.chatRoom}*`);
      await publishMessage(`chat:${message.chatRoom}`, {
        type: 'message_edited',
        messageId,
        newContent,
        editedAt: message.editedAt
      });

      return {
        success: true,
        message: 'Message edited successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration, error);
      throw error;
    }
  }

  // Delete message
  async deleteMessage(messageId, userId) {
    const startTime = Date.now();
    
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      if (message.sender.toString() !== userId) {
        throw new Error('Can only delete your own messages');
      }

      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = 'This message has been deleted';
      await message.save();

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration);

      // Clear cache and publish update
      await deleteCache(`chat_history:${message.chatRoom}*`);
      await publishMessage(`chat:${message.chatRoom}`, {
        type: 'message_deleted',
        messageId
      });

      return {
        success: true,
        message: 'Message deleted successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'messages', duration, error);
      throw error;
    }
  }

  // Get user's active chats
  async getUserChats(userId, page = 1, limit = 20) {
    const startTime = Date.now();
    
    try {
      const skip = (page - 1) * limit;
      
      // Get recent messages from chats where user participated
      const recentMessages = await Message.aggregate([
        {
          $match: {
            $or: [
              { sender: userId },
              { 'readBy.user': userId }
            ],
            isDeleted: false
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: '$chatRoom',
            lastMessage: { $first: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  { $not: { $in: [userId, '$readBy.user'] } },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $sort: { 'lastMessage.createdAt': -1 }
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ]);

      // Populate sender information
      await Message.populate(recentMessages, {
        path: 'lastMessage.sender',
        select: 'username firstName lastName avatar'
      });

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration);

      return {
        chats: recentMessages,
        pagination: {
          currentPage: page,
          hasNext: recentMessages.length === limit,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration, error);
      throw error;
    }
  }

  // Get chat participants
  async getChatParticipants(chatRoom) {
    const startTime = Date.now();
    
    try {
      const participants = await Message.distinct('sender', { chatRoom });
      const users = await User.find({
        _id: { $in: participants }
      }).select('username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration);

      return users;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'messages', duration, error);
      throw error;
    }
  }
}

module.exports = new ChatService();

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/config');
const chatService = require('../services/chatService');
const { subscribeToChannel } = require('../utils/redisClient');
const Logger = require('../utils/logger');

class ChatSocket {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
  }

  initChatSocket(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, jwtSecret);
        socket.userId = decoded.userId;
        socket.user = decoded;
        
        Logger.debug('Socket authenticated', { userId: decoded.userId, socketId: socket.id });
        next();
      } catch (error) {
        Logger.error('Socket authentication failed', { error: error.message });
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    // Subscribe to Redis channels for scaling
    this.setupRedisSubscriptions();

    Logger.success('Socket.IO chat server initialized');
    return this.io;
  }

  handleConnection(socket) {
    const userId = socket.userId;
    
    // Store user connection
    this.connectedUsers.set(userId, socket.id);
    
    Logger.socketEvent('user_connected', { userId, socketId: socket.id });

    // Join user to their personal room for direct notifications
    socket.join(`user_${userId}`);

    // Handle joining chat rooms
    socket.on('join_room', async (data) => {
      try {
        const { roomId, roomType } = data;
        
        // Validate room access based on type
        const canJoin = await this.validateRoomAccess(userId, roomId, roomType);
        if (!canJoin) {
          socket.emit('error', { message: 'Access denied to this chat room' });
          return;
        }

        socket.join(roomId);
        Logger.socketEvent('room_joined', { userId, roomId, roomType });

        // Send recent chat history
        const history = await chatService.getChatHistory(roomId, 1, 20);
        socket.emit('chat_history', history);

        // Notify others in the room
        socket.to(roomId).emit('user_joined', {
          userId,
          timestamp: new Date()
        });

      } catch (error) {
        Logger.error('Error joining room', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to join chat room' });
      }
    });

    // Handle leaving chat rooms
    socket.on('leave_room', (data) => {
      const { roomId } = data;
      socket.leave(roomId);
      
      Logger.socketEvent('room_left', { userId, roomId });
      
      // Notify others in the room
      socket.to(roomId).emit('user_left', {
        userId,
        timestamp: new Date()
      });
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, messageType = 'text', attachments = [], parentMessageId } = data;

        // Validate message
        if (!content || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        if (content.length > 1000) {
          socket.emit('error', { message: 'Message too long (max 1000 characters)' });
          return;
        }

        // Determine chat type based on room ID
        const chatType = this.determineChatType(roomId);
        
        // Prepare message data
        const messageData = {
          sender: userId,
          content: content.trim(),
          messageType,
          chatRoom: roomId,
          chatType,
          attachments,
          parentMessage: parentMessageId || null
        };

        // Add specific data based on chat type
        if (chatType === 'group_planning') {
          messageData.journeyId = this.extractJourneyId(roomId);
        } else if (chatType === 'location_chat') {
          messageData.location = this.extractLocationData(roomId);
        }

        // Save message to database
        const savedMessage = await chatService.saveMessage(messageData);

        // Emit to all users in the room
        this.io.to(roomId).emit('new_message', savedMessage);

        Logger.socketEvent('message_sent', { 
          userId, 
          roomId, 
          messageType, 
          messageId: savedMessage._id 
        });

      } catch (error) {
        Logger.error('Error sending message', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('user_typing', { userId, typing: true });
    });

    socket.on('typing_stop', (data) => {
      const { roomId } = data;
      socket.to(roomId).emit('user_typing', { userId, typing: false });
    });

    // Handle message reactions
    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, emoji } = data;
        await chatService.addReaction(messageId, userId, emoji);
        
        // The reaction will be broadcast via Redis pub/sub
        Logger.socketEvent('reaction_added', { userId, messageId, emoji });
        
      } catch (error) {
        Logger.error('Error adding reaction', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    socket.on('remove_reaction', async (data) => {
      try {
        const { messageId } = data;
        await chatService.removeReaction(messageId, userId);
        
        Logger.socketEvent('reaction_removed', { userId, messageId });
        
      } catch (error) {
        Logger.error('Error removing reaction', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to remove reaction' });
      }
    });

    // Handle message editing
    socket.on('edit_message', async (data) => {
      try {
        const { messageId, newContent } = data;
        await chatService.editMessage(messageId, userId, newContent);
        
        Logger.socketEvent('message_edited', { userId, messageId });
        
      } catch (error) {
        Logger.error('Error editing message', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Handle message deletion
    socket.on('delete_message', async (data) => {
      try {
        const { messageId } = data;
        await chatService.deleteMessage(messageId, userId);
        
        Logger.socketEvent('message_deleted', { userId, messageId });
        
      } catch (error) {
        Logger.error('Error deleting message', { userId, error: error.message });
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle read receipts
    socket.on('mark_messages_read', async (data) => {
      try {
        const { roomId, messageIds = [] } = data;
        await chatService.markMessagesAsRead(roomId, userId, messageIds);
        
        Logger.socketEvent('messages_marked_read', { userId, roomId, count: messageIds.length });
        
      } catch (error) {
        Logger.error('Error marking messages as read', { userId, error: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.connectedUsers.delete(userId);
      Logger.socketEvent('user_disconnected', { userId, socketId: socket.id, reason });
    });

    // Handle errors
    socket.on('error', (error) => {
      Logger.error('Socket error', { userId, socketId: socket.id, error: error.message });
    });
  }

  // Setup Redis subscriptions for scaling across multiple servers
  async setupRedisSubscriptions() {
    try {
      // Subscribe to chat events
      await subscribeToChannel('chat:*', (data) => {
        this.handleRedisMessage(data);
      });

      Logger.info('Redis subscriptions setup for chat scaling');
    } catch (error) {
      Logger.error('Failed to setup Redis subscriptions', { error: error.message });
    }
  }

  handleRedisMessage(data) {
    const { type, ...payload } = data;

    switch (type) {
      case 'new_message':
        // Message already handled by the originating server
        break;
        
      case 'reaction_added':
        this.io.to(payload.message.chatRoom).emit('reaction_updated', {
          messageId: payload.messageId,
          userId: payload.userId,
          emoji: payload.emoji,
          action: 'added'
        });
        break;
        
      case 'reaction_removed':
        this.io.to(payload.message.chatRoom).emit('reaction_updated', {
          messageId: payload.messageId,
          userId: payload.userId,
          action: 'removed'
        });
        break;
        
      case 'message_edited':
        this.io.to(payload.message.chatRoom).emit('message_updated', {
          messageId: payload.messageId,
          newContent: payload.newContent,
          editedAt: payload.editedAt
        });
        break;
        
      case 'message_deleted':
        this.io.to(payload.message.chatRoom).emit('message_deleted', {
          messageId: payload.messageId
        });
        break;
        
      case 'messages_read':
        this.io.to(payload.message.chatRoom).emit('messages_read', {
          userId: payload.userId,
          messageIds: payload.messageIds
        });
        break;
    }
  }

  // Validate if user can access a chat room
  async validateRoomAccess(userId, roomId, roomType) {
    try {
      switch (roomType) {
        case 'group_planning':
          // Check if user is creator or collaborator of the journey
          const journeyId = this.extractJourneyId(roomId);
          // This would need to be implemented with proper journey access check
          return true; // Simplified for now
          
        case 'location_chat':
          // For location chats, we might want to verify user is actually at the location
          // This could involve geofencing logic
          return true; // Simplified for now
          
        case 'qa_chat':
          // Check if user is either the asker or the journey creator
          return true; // Simplified for now
          
        case 'direct':
          // Check if user is one of the participants
          return true; // Simplified for now
          
        default:
          return false;
      }
    } catch (error) {
      Logger.error('Error validating room access', { userId, roomId, error: error.message });
      return false;
    }
  }

  // Helper methods
  determineChatType(roomId) {
    if (roomId.startsWith('journey_')) return 'group_planning';
    if (roomId.startsWith('location_')) return 'location_chat';
    if (roomId.startsWith('qa_')) return 'qa_chat';
    return 'direct';
  }

  extractJourneyId(roomId) {
    return roomId.replace('journey_', '');
  }

  extractLocationData(roomId) {
    const coords = roomId.replace('location_', '').split('_');
    return {
      coordinates: {
        latitude: parseFloat(coords[0]),
        longitude: parseFloat(coords[1])
      }
    };
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(`user_${userId}`).emit('notification', notification);
    }
  }

  // Get online users in a room
  getOnlineUsersInRoom(roomId) {
    const room = this.io.sockets.adapter.rooms.get(roomId);
    return room ? Array.from(room) : [];
  }
}

const chatSocket = new ChatSocket();

module.exports = {
  initChatSocket: (server) => chatSocket.initChatSocket(server),
  sendNotificationToUser: (userId, notification) => chatSocket.sendNotificationToUser(userId, notification),
  getOnlineUsersInRoom: (roomId) => chatSocket.getOnlineUsersInRoom(roomId)
};

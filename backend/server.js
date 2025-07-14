require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');

// Import configuration and utilities
const config = require('./config/config');
const connectDB = require('./config/database');
const { createRedisClient } = require('./utils/redisClient');
const Logger = require('./utils/logger');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

// Import routes
const userRoutes = require('./routes/userRoutes');
const journeyRoutes = require('./routes/journeyRoutes');
const chatRoutes = require('./routes/chatRoutes');
const aiRoutes = require('./routes/aiRoutes');

// Import Socket.IO handler
const { initChatSocket } = require('./sockets/chatSocket');

class TravelPlatformServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.io = null;
  }

  async initialize() {
    try {
      // Connect to database
      await connectDB();
      Logger.success('Database connected successfully');

      // Initialize Redis (optional - continues without Redis if it fails)
      try {
        await createRedisClient();
        Logger.success('Redis connected successfully');
      } catch (error) {
        Logger.warn('Redis connection failed, continuing without caching', { error: error.message });
      }

      // Setup Express app
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      // Create HTTP server
      this.server = http.createServer(this.app);

      // Initialize Socket.IO for real-time chat
      this.io = initChatSocket(this.server);
      Logger.success('Socket.IO initialized for real-time chat');

      // Start server
      const PORT = config.port;
      this.server.listen(PORT, () => {
        Logger.success(`🚀 Travel Platform Server running on port ${PORT}`);
        Logger.info(`Environment: ${config.nodeEnv}`);
        Logger.info(`API Base URL: http://localhost:${PORT}/api`);
        
        if (config.nodeEnv === 'development') {
          this.logAvailableRoutes();
        }
      });

      // Handle graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      Logger.error('Failed to initialize server', { error: error.message });
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use(Logger.requestLogger);

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Travel Platform API',
        version: '1.0.0',
        description: 'Smart community-oriented travel platform backend',
        endpoints: {
          users: '/api/users',
          journeys: '/api/journeys',
          chat: '/api/chat',
          ai: '/api/ai'
        },
        documentation: '/api/docs',
        health: '/health'
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/journeys', journeyRoutes);
    this.app.use('/api/chat', chatRoutes);
    this.app.use('/api/ai', aiRoutes);

    // Catch-all for undefined routes
    this.app.use('*', notFound);
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(errorHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      Logger.error('Unhandled Promise Rejection', { error: err.message, stack: err.stack });
      this.gracefulShutdown('SIGTERM');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      Logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      this.gracefulShutdown('SIGTERM');
    });
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        Logger.info(`Received ${signal}, starting graceful shutdown...`);
        this.gracefulShutdown(signal);
      });
    });
  }

  async gracefulShutdown(signal) {
    Logger.info(`Graceful shutdown initiated by ${signal}`);
    
    // Stop accepting new connections
    if (this.server) {
      this.server.close(async () => {
        Logger.info('HTTP server closed');
        
        try {
          // Close Socket.IO connections
          if (this.io) {
            this.io.close();
            Logger.info('Socket.IO server closed');
          }

          // Close database connection
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          Logger.info('Database connection closed');

          // Close Redis connection
          const { getRedisClient } = require('./utils/redisClient');
          const redisClient = getRedisClient();
          if (redisClient) {
            await redisClient.quit();
            Logger.info('Redis connection closed');
          }

          Logger.success('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          Logger.error('Error during graceful shutdown', { error: error.message });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        Logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    }
  }

  logAvailableRoutes() {
    Logger.info('📋 Available API Endpoints:');
    Logger.info('');
    Logger.info('🔐 Authentication:');
    Logger.info('  POST /api/users/register - Register new user');
    Logger.info('  POST /api/users/login - User login');
    Logger.info('  POST /api/users/verify-token - Verify JWT token');
    Logger.info('');
    Logger.info('👤 User Management:');
    Logger.info('  GET  /api/users/profile - Get current user profile');
    Logger.info('  PUT  /api/users/profile - Update user profile');
    Logger.info('  GET  /api/users/search - Search users');
    Logger.info('  GET  /api/users/:userId - Get user by ID');
    Logger.info('');
    Logger.info('🗺️  Journey Management:');
    Logger.info('  GET  /api/journeys/public - Get public journeys');
    Logger.info('  POST /api/journeys - Create new journey');
    Logger.info('  GET  /api/journeys/:journeyId - Get journey by ID');
    Logger.info('  PUT  /api/journeys/:journeyId - Update journey');
    Logger.info('  DELETE /api/journeys/:journeyId - Delete journey');
    Logger.info('  GET  /api/journeys/search - Search journeys');
    Logger.info('');
    Logger.info('💬 Chat System:');
    Logger.info('  POST /api/chat/group-planning - Create group planning chat');
    Logger.info('  POST /api/chat/location - Join location-based chat');
    Logger.info('  POST /api/chat/qa - Create Q&A chat');
    Logger.info('  GET  /api/chat/room/:roomId/history - Get chat history');
    Logger.info('  GET  /api/chat/my-chats - Get user\'s active chats');
    Logger.info('');
    Logger.info('🤖 AI Travel Assistant:');
    Logger.info('  POST /api/ai/assistant - Main AI travel assistant');
    Logger.info('  POST /api/ai/recommendations - Get destination recommendations');
    Logger.info('  POST /api/ai/itinerary - Get itinerary suggestions');
    Logger.info('  POST /api/ai/tips - Get travel tips');
    Logger.info('  POST /api/ai/faq - FAQ responses');
    Logger.info('  GET  /api/ai/status - AI service status');
    Logger.info('');
    Logger.info('🔧 Utility:');
    Logger.info('  GET  /health - Health check');
    Logger.info('  GET  /api - API information');
    Logger.info('');
    Logger.info('🔌 WebSocket (Socket.IO):');
    Logger.info('  Real-time chat events on same port');
    Logger.info('');
  }
}

// Initialize and start the server
const server = new TravelPlatformServer();
server.initialize().catch(error => {
  Logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});

// Export for testing purposes
module.exports = server;

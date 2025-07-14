const userService = require('../services/userService');
const Logger = require('../utils/logger');

class UserController {
  // Register new user
  async register(req, res, next) {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // Validation
      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await userService.registerUser({
        username,
        email,
        password,
        firstName,
        lastName
      });

      Logger.info('User registered successfully', { 
        userId: result.user._id, 
        username: result.user.username 
      });

      res.status(201).json(result);

    } catch (error) {
      Logger.error('Registration failed', { error: error.message });
      next(error);
    }
  }

  // Login user
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      const result = await userService.loginUser({ email, password });

      Logger.info('User logged in successfully', { 
        userId: result.user._id, 
        username: result.user.username 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Login failed', { email: req.body.email, error: error.message });
      
      if (error.message === 'Invalid email or password') {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Get current user profile
  async getProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const userProfile = await userService.getUserProfile(userId);

      res.json({
        success: true,
        user: userProfile
      });

    } catch (error) {
      Logger.error('Failed to get user profile', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get user profile by ID
  async getUserById(req, res, next) {
    try {
      const { userId } = req.params;
      const userProfile = await userService.getUserProfile(userId);

      res.json({
        success: true,
        user: userProfile
      });

    } catch (error) {
      Logger.error('Failed to get user by ID', { 
        requestedUserId: req.params.userId, 
        error: error.message 
      });
      
      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Update user profile
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const updateData = req.body;

      // Remove sensitive fields that shouldn't be updated via this endpoint
      delete updateData.password;
      delete updateData.email;
      delete updateData.username;
      delete updateData.role;

      const result = await userService.updateUserProfile(userId, updateData);

      Logger.info('User profile updated', { userId, updatedFields: Object.keys(updateData) });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to update user profile', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Search users
  async searchUsers(req, res, next) {
    try {
      const { q: query, limit = 20 } = req.query;
      const currentUserId = req.user.userId;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      const users = await userService.searchUsers(
        query.trim(), 
        currentUserId, 
        parseInt(limit)
      );

      res.json({
        success: true,
        users,
        query: query.trim()
      });

    } catch (error) {
      Logger.error('User search failed', { 
        query: req.query.q, 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get user statistics
  async getUserStats(req, res, next) {
    try {
      const { userId } = req.params;
      const requesterId = req.user.userId;

      // Users can only see their own detailed stats, others see limited stats
      const stats = await userService.getUserStats(userId);

      // If requesting someone else's stats, limit the information
      if (userId !== requesterId) {
        const limitedStats = {
          journeysCreated: stats.journeysCreated,
          placesVisited: stats.placesVisited
        };
        
        return res.json({
          success: true,
          stats: limitedStats
        });
      }

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      Logger.error('Failed to get user stats', { 
        userId: req.params.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Verify token (for frontend auth checks)
  async verifyToken(req, res, next) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const result = await userService.verifyToken(token);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }

      res.json({
        success: true,
        user: result.user
      });

    } catch (error) {
      Logger.error('Token verification failed', { error: error.message });
      next(error);
    }
  }

  // Get multiple users by IDs (for populating user info in chats, etc.)
  async getUsersByIds(req, res, next) {
    try {
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'User IDs array is required'
        });
      }

      if (userIds.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Cannot fetch more than 50 users at once'
        });
      }

      const users = await userService.getUsersByIds(userIds);

      res.json({
        success: true,
        users
      });

    } catch (error) {
      Logger.error('Failed to get users by IDs', { 
        userIdsCount: req.body.userIds?.length, 
        error: error.message 
      });
      next(error);
    }
  }

  // Update user preferences
  async updatePreferences(req, res, next) {
    try {
      const userId = req.user.userId;
      const { notifications, privacy } = req.body;

      const updateData = {};
      
      if (notifications) {
        if (typeof notifications.email === 'boolean') {
          updateData['preferences.notifications.email'] = notifications.email;
        }
        if (typeof notifications.push === 'boolean') {
          updateData['preferences.notifications.push'] = notifications.push;
        }
        if (typeof notifications.chat === 'boolean') {
          updateData['preferences.notifications.chat'] = notifications.chat;
        }
      }

      if (privacy) {
        if (['public', 'friends', 'private'].includes(privacy.profileVisibility)) {
          updateData['preferences.privacy.profileVisibility'] = privacy.profileVisibility;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid preferences provided'
        });
      }

      const result = await userService.updateUserProfile(userId, updateData);

      Logger.info('User preferences updated', { userId, updatedPreferences: Object.keys(updateData) });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to update user preferences', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }
}

module.exports = new UserController();

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { jwtSecret } = require('../config/config');
const { setCache, getCache, deleteCache } = require('../utils/redisClient');
const Logger = require('../utils/logger');

class UserService {
  // Generate JWT token
  generateToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      jwtSecret,
      { expiresIn: '7d' }
    );
  }

  // Register new user
  async registerUser(userData) {
    const startTime = Date.now();
    
    try {
      const { username, email, password, firstName, lastName } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw new Error('Email is already registered');
        }
        if (existingUser.username === username) {
          throw new Error('Username is already taken');
        }
      }

      // Create new user
      const user = new User({
        username,
        email,
        password,
        firstName,
        lastName
      });

      await user.save();

      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'users', duration);

      // Generate token
      const token = this.generateToken(user._id);

      // Cache user data
      await setCache(`user:${user._id}`, user.getPublicProfile(), 3600);

      return {
        success: true,
        message: 'User registered successfully',
        user: user.getPublicProfile(),
        token
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'users', duration, error);
      throw error;
    }
  }

  // Login user
  async loginUser(credentials) {
    const startTime = Date.now();
    
    try {
      const { email, password } = credentials;

      // Find user and include password for comparison
      const user = await User.findOne({ email }).select('+password');

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration);

      // Generate token
      const token = this.generateToken(user._id);

      // Cache user data
      await setCache(`user:${user._id}`, user.getPublicProfile(), 3600);

      return {
        success: true,
        message: 'Login successful',
        user: user.getPublicProfile(),
        token
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration, error);
      throw error;
    }
  }

  // Get user profile
  async getUserProfile(userId) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cachedUser = await getCache(`user:${userId}`);
      if (cachedUser) {
        Logger.debug('User profile served from cache', { userId });
        return cachedUser;
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration);

      const userProfile = user.getPublicProfile();

      // Cache the result
      await setCache(`user:${userId}`, userProfile, 3600);

      return userProfile;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration, error);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updateData) {
    const startTime = Date.now();
    
    try {
      const allowedUpdates = [
        'firstName', 'lastName', 'bio', 'location', 'avatar',
        'preferences.notifications.email',
        'preferences.notifications.push',
        'preferences.notifications.chat',
        'preferences.privacy.profileVisibility'
      ];

      // Filter out non-allowed updates
      const filteredUpdates = {};
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updateData[key];
        }
      });

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'users', duration);

      // Update cache
      await setCache(`user:${userId}`, user.getPublicProfile(), 3600);

      return {
        success: true,
        message: 'Profile updated successfully',
        user: user.getPublicProfile()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'users', duration, error);
      throw error;
    }
  }

  // Search users
  async searchUsers(query, currentUserId, limit = 20) {
    const startTime = Date.now();
    
    try {
      const searchRegex = new RegExp(query, 'i');
      
      const users = await User.find({
        _id: { $ne: currentUserId }, // Exclude current user
        $or: [
          { username: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex }
        ],
        'preferences.privacy.profileVisibility': { $in: ['public', 'friends'] }
      })
      .select('username firstName lastName avatar bio location stats')
      .limit(limit);

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration);

      return users;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration, error);
      throw error;
    }
  }

  // Get user stats
  async getUserStats(userId) {
    const startTime = Date.now();
    
    try {
      const user = await User.findById(userId).select('stats');
      if (!user) {
        throw new Error('User not found');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration);

      return user.stats;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration, error);
      throw error;
    }
  }

  // Update user stats
  async updateUserStats(userId, statUpdates) {
    const startTime = Date.now();
    
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: statUpdates },
        { new: true }
      ).select('stats');

      if (!user) {
        throw new Error('User not found');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'users', duration);

      // Clear user cache to force refresh
      await deleteCache(`user:${userId}`);

      return user.stats;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'users', duration, error);
      throw error;
    }
  }

  // Verify token
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const user = await this.getUserProfile(decoded.userId);
      return { valid: true, user };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Get multiple users by IDs
  async getUsersByIds(userIds) {
    const startTime = Date.now();
    
    try {
      const users = await User.find({
        _id: { $in: userIds }
      }).select('username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration);

      return users;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'users', duration, error);
      throw error;
    }
  }
}

module.exports = new UserService();

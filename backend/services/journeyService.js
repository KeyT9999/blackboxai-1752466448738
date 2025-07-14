const Journey = require('../models/journeyModel');
const User = require('../models/userModel');
const { setCache, getCache, deleteCache, deleteCachePattern } = require('../utils/redisClient');
const Logger = require('../utils/logger');

class JourneyService {
  // Create new journey
  async createJourney(journeyData, creatorId) {
    const startTime = Date.now();
    
    try {
      const journey = new Journey({
        ...journeyData,
        creator: creatorId
      });

      await journey.save();
      await journey.populate('creator', 'username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'journeys', duration);

      // Update user stats
      await User.findByIdAndUpdate(
        creatorId,
        { $inc: { 'stats.journeysCreated': 1 } }
      );

      // Clear relevant caches
      await deleteCachePattern(`journeys:user:${creatorId}*`);
      await deleteCachePattern('journeys:public*');

      return {
        success: true,
        message: 'Journey created successfully',
        journey
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('CREATE', 'journeys', duration, error);
      throw error;
    }
  }

  // Get journey by ID
  async getJourneyById(journeyId, userId = null) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `journey:${journeyId}`;
      const cachedJourney = await getCache(cacheKey);
      
      if (cachedJourney) {
        Logger.debug('Journey served from cache', { journeyId });
        return cachedJourney;
      }

      const journey = await Journey.findById(journeyId)
        .populate('creator', 'username firstName lastName avatar')
        .populate('collaborators.user', 'username firstName lastName avatar')
        .populate('comments.user', 'username firstName lastName avatar');

      if (!journey) {
        throw new Error('Journey not found');
      }

      // Check visibility permissions
      if (!this.canUserViewJourney(journey, userId)) {
        throw new Error('Access denied to this journey');
      }

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration);

      // Increment view count if not the creator
      if (userId && journey.creator._id.toString() !== userId) {
        await Journey.findByIdAndUpdate(journeyId, {
          $inc: { 'stats.views': 1 }
        });
        journey.stats.views += 1;
      }

      // Cache the result
      await setCache(cacheKey, journey, 1800); // 30 minutes

      return journey;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration, error);
      throw error;
    }
  }

  // Update journey
  async updateJourney(journeyId, updateData, userId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId);
      
      if (!journey) {
        throw new Error('Journey not found');
      }

      // Check permissions
      if (!this.canUserEditJourney(journey, userId)) {
        throw new Error('Access denied to edit this journey');
      }

      const allowedUpdates = [
        'title', 'description', 'destinations', 'itinerary', 'duration',
        'budget', 'tags', 'difficulty', 'travelStyle', 'status',
        'visibility', 'coverImage', 'photos'
      ];

      const filteredUpdates = {};
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updateData[key];
        }
      });

      const updatedJourney = await Journey.findByIdAndUpdate(
        journeyId,
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      )
      .populate('creator', 'username firstName lastName avatar')
      .populate('collaborators.user', 'username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration);

      // Clear caches
      await deleteCache(`journey:${journeyId}`);
      await deleteCachePattern(`journeys:user:${journey.creator}*`);
      if (journey.visibility === 'public') {
        await deleteCachePattern('journeys:public*');
      }

      return {
        success: true,
        message: 'Journey updated successfully',
        journey: updatedJourney
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration, error);
      throw error;
    }
  }

  // Delete journey
  async deleteJourney(journeyId, userId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId);
      
      if (!journey) {
        throw new Error('Journey not found');
      }

      // Only creator can delete
      if (journey.creator.toString() !== userId) {
        throw new Error('Only the creator can delete this journey');
      }

      await Journey.findByIdAndDelete(journeyId);

      const duration = Date.now() - startTime;
      Logger.dbOperation('DELETE', 'journeys', duration);

      // Update user stats
      await User.findByIdAndUpdate(
        userId,
        { $inc: { 'stats.journeysCreated': -1 } }
      );

      // Clear caches
      await deleteCache(`journey:${journeyId}`);
      await deleteCachePattern(`journeys:user:${userId}*`);
      await deleteCachePattern('journeys:public*');

      return {
        success: true,
        message: 'Journey deleted successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('DELETE', 'journeys', duration, error);
      throw error;
    }
  }

  // Get public journeys (feed)
  async getPublicJourneys(page = 1, limit = 20, filters = {}) {
    const startTime = Date.now();
    
    try {
      const cacheKey = `journeys:public:${page}:${limit}:${JSON.stringify(filters)}`;
      const cachedJourneys = await getCache(cacheKey);
      
      if (cachedJourneys) {
        Logger.debug('Public journeys served from cache', { page, limit });
        return cachedJourneys;
      }

      const skip = (page - 1) * limit;
      const query = { visibility: 'public' };

      // Apply filters
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }
      if (filters.difficulty) {
        query.difficulty = filters.difficulty;
      }
      if (filters.travelStyle) {
        query.travelStyle = filters.travelStyle;
      }
      if (filters.status) {
        query.status = filters.status;
      }

      const journeys = await Journey.find(query)
        .populate('creator', 'username firstName lastName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Journey.countDocuments(query);

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration);

      const result = {
        journeys,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalJourneys: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

      // Cache for 10 minutes
      await setCache(cacheKey, result, 600);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration, error);
      throw error;
    }
  }

  // Get user's journeys
  async getUserJourneys(userId, requesterId = null, page = 1, limit = 20) {
    const startTime = Date.now();
    
    try {
      const cacheKey = `journeys:user:${userId}:${page}:${limit}`;
      const cachedJourneys = await getCache(cacheKey);
      
      if (cachedJourneys && userId !== requesterId) {
        Logger.debug('User journeys served from cache', { userId, page });
        return cachedJourneys;
      }

      const skip = (page - 1) * limit;
      let query = { creator: userId };

      // If not viewing own journeys, only show public ones
      if (userId !== requesterId) {
        query.visibility = 'public';
      }

      const journeys = await Journey.find(query)
        .populate('creator', 'username firstName lastName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Journey.countDocuments(query);

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration);

      const result = {
        journeys,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalJourneys: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

      // Cache for 5 minutes (shorter for user-specific data)
      if (userId !== requesterId) {
        await setCache(cacheKey, result, 300);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration, error);
      throw error;
    }
  }

  // Add collaborator to journey
  async addCollaborator(journeyId, collaboratorData, userId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId);
      
      if (!journey) {
        throw new Error('Journey not found');
      }

      if (journey.creator.toString() !== userId) {
        throw new Error('Only the creator can add collaborators');
      }

      const { userId: collaboratorId, role = 'viewer' } = collaboratorData;

      // Check if user is already a collaborator
      const existingCollaborator = journey.collaborators.find(
        collab => collab.user.toString() === collaboratorId
      );

      if (existingCollaborator) {
        throw new Error('User is already a collaborator');
      }

      journey.collaborators.push({
        user: collaboratorId,
        role
      });

      await journey.save();
      await journey.populate('collaborators.user', 'username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration);

      // Clear cache
      await deleteCache(`journey:${journeyId}`);

      return {
        success: true,
        message: 'Collaborator added successfully',
        collaborators: journey.collaborators
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration, error);
      throw error;
    }
  }

  // Like/Unlike journey
  async toggleLike(journeyId, userId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId);
      
      if (!journey) {
        throw new Error('Journey not found');
      }

      const existingLike = journey.likes.find(
        like => like.user.toString() === userId
      );

      if (existingLike) {
        // Unlike
        journey.likes = journey.likes.filter(
          like => like.user.toString() !== userId
        );
      } else {
        // Like
        journey.likes.push({ user: userId });
      }

      await journey.save();

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration);

      // Clear cache
      await deleteCache(`journey:${journeyId}`);

      return {
        success: true,
        liked: !existingLike,
        likesCount: journey.likes.length
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration, error);
      throw error;
    }
  }

  // Add comment to journey
  async addComment(journeyId, commentData, userId) {
    const startTime = Date.now();
    
    try {
      const journey = await Journey.findById(journeyId);
      
      if (!journey) {
        throw new Error('Journey not found');
      }

      if (!this.canUserViewJourney(journey, userId)) {
        throw new Error('Access denied to comment on this journey');
      }

      journey.comments.push({
        user: userId,
        content: commentData.content
      });

      await journey.save();
      await journey.populate('comments.user', 'username firstName lastName avatar');

      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration);

      // Clear cache
      await deleteCache(`journey:${journeyId}`);

      const newComment = journey.comments[journey.comments.length - 1];

      return {
        success: true,
        message: 'Comment added successfully',
        comment: newComment
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('UPDATE', 'journeys', duration, error);
      throw error;
    }
  }

  // Search journeys
  async searchJourneys(query, filters = {}, page = 1, limit = 20) {
    const startTime = Date.now();
    
    try {
      const skip = (page - 1) * limit;
      const searchQuery = {
        visibility: 'public',
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } }
        ]
      };

      // Apply additional filters
      if (filters.tags && filters.tags.length > 0) {
        searchQuery.tags = { $in: filters.tags };
      }
      if (filters.difficulty) {
        searchQuery.difficulty = filters.difficulty;
      }

      const journeys = await Journey.find(searchQuery)
        .populate('creator', 'username firstName lastName avatar')
        .sort({ 'stats.likes': -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Journey.countDocuments(searchQuery);

      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration);

      return {
        journeys,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalJourneys: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.dbOperation('READ', 'journeys', duration, error);
      throw error;
    }
  }

  // Helper methods
  canUserViewJourney(journey, userId) {
    if (journey.visibility === 'public') return true;
    if (!userId) return false;
    if (journey.creator._id.toString() === userId) return true;
    if (journey.visibility === 'collaborators') {
      return journey.collaborators.some(
        collab => collab.user._id.toString() === userId
      );
    }
    return false;
  }

  canUserEditJourney(journey, userId) {
    if (!userId) return false;
    if (journey.creator.toString() === userId) return true;
    
    const collaborator = journey.collaborators.find(
      collab => collab.user.toString() === userId
    );
    
    return collaborator && collaborator.role === 'editor';
  }
}

module.exports = new JourneyService();

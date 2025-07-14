const journeyService = require('../services/journeyService');
const userService = require('../services/userService');
const Logger = require('../utils/logger');

class JourneyController {
  // Create new journey
  async createJourney(req, res, next) {
    try {
      const creatorId = req.user.userId;
      const journeyData = req.body;

      // Validation
      if (!journeyData.title || !journeyData.description) {
        return res.status(400).json({
          success: false,
          message: 'Title and description are required'
        });
      }

      if (journeyData.title.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Title cannot exceed 100 characters'
        });
      }

      if (journeyData.description.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot exceed 1000 characters'
        });
      }

      const result = await journeyService.createJourney(journeyData, creatorId);

      Logger.info('Journey created', { 
        journeyId: result.journey._id, 
        creatorId, 
        title: result.journey.title 
      });

      res.status(201).json(result);

    } catch (error) {
      Logger.error('Failed to create journey', { 
        creatorId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get journey by ID
  async getJourneyById(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user?.userId;

      const journey = await journeyService.getJourneyById(journeyId, userId);

      res.json({
        success: true,
        journey
      });

    } catch (error) {
      Logger.error('Failed to get journey', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Access denied to this journey') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Update journey
  async updateJourney(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user.userId;
      const updateData = req.body;

      // Validation
      if (updateData.title && updateData.title.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Title cannot exceed 100 characters'
        });
      }

      if (updateData.description && updateData.description.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot exceed 1000 characters'
        });
      }

      const result = await journeyService.updateJourney(journeyId, updateData, userId);

      Logger.info('Journey updated', { 
        journeyId, 
        userId, 
        updatedFields: Object.keys(updateData) 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to update journey', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Access denied to edit this journey') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Delete journey
  async deleteJourney(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user.userId;

      const result = await journeyService.deleteJourney(journeyId, userId);

      Logger.info('Journey deleted', { journeyId, userId });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to delete journey', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Only the creator can delete this journey') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Get public journeys (feed)
  async getPublicJourneys(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        tags, 
        difficulty, 
        travelStyle, 
        status 
      } = req.query;

      // Parse filters
      const filters = {};
      if (tags) {
        filters.tags = Array.isArray(tags) ? tags : tags.split(',');
      }
      if (difficulty) filters.difficulty = difficulty;
      if (travelStyle) filters.travelStyle = travelStyle;
      if (status) filters.status = status;

      const result = await journeyService.getPublicJourneys(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      Logger.error('Failed to get public journeys', { 
        query: req.query, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get user's journeys
  async getUserJourneys(req, res, next) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.userId;
      const { page = 1, limit = 20 } = req.query;

      const result = await journeyService.getUserJourneys(
        userId, 
        requesterId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      Logger.error('Failed to get user journeys', { 
        userId: req.params.userId, 
        requesterId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get current user's journeys
  async getMyJourneys(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 20 } = req.query;

      const result = await journeyService.getUserJourneys(
        userId, 
        userId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      Logger.error('Failed to get my journeys', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Add collaborator to journey
  async addCollaborator(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user.userId;
      const { userId: collaboratorId, role = 'viewer' } = req.body;

      if (!collaboratorId) {
        return res.status(400).json({
          success: false,
          message: 'Collaborator user ID is required'
        });
      }

      if (!['editor', 'viewer'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Role must be either "editor" or "viewer"'
        });
      }

      // Verify collaborator user exists
      try {
        await userService.getUserProfile(collaboratorId);
      } catch (error) {
        return res.status(404).json({
          success: false,
          message: 'Collaborator user not found'
        });
      }

      const result = await journeyService.addCollaborator(
        journeyId, 
        { userId: collaboratorId, role }, 
        userId
      );

      Logger.info('Collaborator added to journey', { 
        journeyId, 
        creatorId: userId, 
        collaboratorId, 
        role 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to add collaborator', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Only the creator can add collaborators') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'User is already a collaborator') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Like/Unlike journey
  async toggleLike(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user.userId;

      const result = await journeyService.toggleLike(journeyId, userId);

      Logger.info('Journey like toggled', { 
        journeyId, 
        userId, 
        liked: result.liked 
      });

      res.json(result);

    } catch (error) {
      Logger.error('Failed to toggle journey like', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Add comment to journey
  async addComment(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user.userId;
      const { content } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Comment content is required'
        });
      }

      if (content.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Comment cannot exceed 500 characters'
        });
      }

      const result = await journeyService.addComment(
        journeyId, 
        { content: content.trim() }, 
        userId
      );

      Logger.info('Comment added to journey', { 
        journeyId, 
        userId, 
        commentId: result.comment._id 
      });

      res.status(201).json(result);

    } catch (error) {
      Logger.error('Failed to add comment', { 
        journeyId: req.params.journeyId, 
        userId: req.user?.userId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Access denied to comment on this journey') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Search journeys
  async searchJourneys(req, res, next) {
    try {
      const { 
        q: query, 
        page = 1, 
        limit = 20, 
        tags, 
        difficulty 
      } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters long'
        });
      }

      // Parse filters
      const filters = {};
      if (tags) {
        filters.tags = Array.isArray(tags) ? tags : tags.split(',');
      }
      if (difficulty) filters.difficulty = difficulty;

      const result = await journeyService.searchJourneys(
        query.trim(), 
        filters, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        query: query.trim(),
        ...result
      });

    } catch (error) {
      Logger.error('Journey search failed', { 
        query: req.query.q, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get journey statistics (for analytics)
  async getJourneyStats(req, res, next) {
    try {
      const { journeyId } = req.params;
      const userId = req.user?.userId;

      const journey = await journeyService.getJourneyById(journeyId, userId);

      // Only return stats if user can view the journey
      res.json({
        success: true,
        stats: journey.stats
      });

    } catch (error) {
      Logger.error('Failed to get journey stats', { 
        journeyId: req.params.journeyId, 
        error: error.message 
      });

      if (error.message === 'Journey not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Access denied to this journey') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }
}

module.exports = new JourneyController();

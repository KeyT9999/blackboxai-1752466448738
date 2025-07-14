const aiService = require('../services/aiService');
const Logger = require('../utils/logger');

class AIController {
  // Main AI Travel Assistant endpoint
  async aiTravelAssistant(req, res, next) {
    try {
      const { query, systemPrompt } = req.body;
      const userId = req.user?.userId;

      // Validation
      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Query is required'
        });
      }

      if (query.length > 2000) {
        return res.status(400).json({
          success: false,
          message: 'Query is too long (maximum 2000 characters)'
        });
      }

      // Validate custom system prompt if provided
      if (systemPrompt && !aiService.validateSystemPrompt(systemPrompt)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid system prompt provided'
        });
      }

      const aiResponse = await aiService.getTravelAnswer(
        query.trim(), 
        systemPrompt, 
        userId
      );

      Logger.info('AI travel assistant query processed', { 
        userId, 
        queryLength: query.length,
        hasCustomPrompt: !!systemPrompt
      });

      res.json({
        success: true,
        query: query.trim(),
        answer: aiResponse,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('AI travel assistant failed', { 
        userId: req.user?.userId, 
        error: error.message 
      });

      // Handle specific AI service errors
      if (error.message.includes('AI service is currently busy')) {
        return res.status(429).json({
          success: false,
          message: error.message
        });
      }

      if (error.message.includes('AI service authentication failed')) {
        return res.status(503).json({
          success: false,
          message: 'AI service is temporarily unavailable'
        });
      }

      if (error.message.includes('request timed out')) {
        return res.status(408).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  }

  // Get destination recommendations
  async getDestinationRecommendations(req, res, next) {
    try {
      const { preferences, budget, travelDates } = req.body;
      const userId = req.user?.userId;

      if (!preferences || Object.keys(preferences).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Travel preferences are required'
        });
      }

      const recommendations = await aiService.getDestinationRecommendations(
        preferences, 
        budget, 
        travelDates
      );

      Logger.info('Destination recommendations generated', { 
        userId, 
        preferences: Object.keys(preferences),
        hasBudget: !!budget,
        hasTravelDates: !!travelDates
      });

      res.json({
        success: true,
        recommendations,
        preferences,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to get destination recommendations', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get itinerary suggestions
  async getItinerarySuggestions(req, res, next) {
    try {
      const { destination, duration, interests, budget } = req.body;
      const userId = req.user?.userId;

      // Validation
      if (!destination || destination.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Destination is required'
        });
      }

      if (!duration || duration < 1 || duration > 30) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be between 1 and 30 days'
        });
      }

      if (!interests || !Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one interest is required'
        });
      }

      const itinerary = await aiService.getItinerarySuggestions(
        destination.trim(), 
        duration, 
        interests, 
        budget
      );

      Logger.info('Itinerary suggestions generated', { 
        userId, 
        destination: destination.trim(), 
        duration, 
        interestsCount: interests.length,
        hasBudget: !!budget
      });

      res.json({
        success: true,
        destination: destination.trim(),
        duration,
        interests,
        budget,
        itinerary,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to get itinerary suggestions', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get travel tips for a destination
  async getTravelTips(req, res, next) {
    try {
      const { destination, travelType = 'general' } = req.body;
      const userId = req.user?.userId;

      if (!destination || destination.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Destination is required'
        });
      }

      const validTravelTypes = ['general', 'solo', 'family', 'business', 'budget', 'luxury'];
      if (!validTravelTypes.includes(travelType)) {
        return res.status(400).json({
          success: false,
          message: `Travel type must be one of: ${validTravelTypes.join(', ')}`
        });
      }

      const tips = await aiService.getTravelTips(destination.trim(), travelType);

      Logger.info('Travel tips generated', { 
        userId, 
        destination: destination.trim(), 
        travelType 
      });

      res.json({
        success: true,
        destination: destination.trim(),
        travelType,
        tips,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to get travel tips', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Get FAQ response
  async getFAQResponse(req, res, next) {
    try {
      const { question } = req.body;
      const userId = req.user?.userId;

      if (!question || question.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Question is required'
        });
      }

      if (question.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Question is too long (maximum 500 characters)'
        });
      }

      const answer = await aiService.getFAQResponse(question.trim());

      Logger.info('FAQ response generated', { 
        userId, 
        questionLength: question.length 
      });

      res.json({
        success: true,
        question: question.trim(),
        answer,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to get FAQ response', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }

  // Validate system prompt (for user customization)
  async validateSystemPrompt(req, res, next) {
    try {
      const { systemPrompt } = req.body;

      if (!systemPrompt) {
        return res.status(400).json({
          success: false,
          message: 'System prompt is required'
        });
      }

      const isValid = aiService.validateSystemPrompt(systemPrompt);

      res.json({
        success: true,
        valid: isValid,
        message: isValid ? 'System prompt is valid' : 'System prompt contains invalid content'
      });

    } catch (error) {
      Logger.error('Failed to validate system prompt', { 
        error: error.message 
      });
      next(error);
    }
  }

  // Get AI service status
  async getServiceStatus(req, res, next) {
    try {
      // Simple health check by making a minimal AI request
      const testQuery = "Hello";
      const startTime = Date.now();
      
      try {
        await aiService.getTravelAnswer(testQuery);
        const responseTime = Date.now() - startTime;
        
        res.json({
          success: true,
          status: 'operational',
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({
          success: false,
          status: 'unavailable',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      Logger.error('Failed to check AI service status', { 
        error: error.message 
      });
      next(error);
    }
  }

  // Get default system prompt (for frontend display)
  async getDefaultSystemPrompt(req, res, next) {
    try {
      res.json({
        success: true,
        systemPrompt: aiService.defaultSystemPrompt,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to get default system prompt', { 
        error: error.message 
      });
      next(error);
    }
  }

  // Batch AI requests (for multiple questions at once)
  async batchRequests(req, res, next) {
    try {
      const { requests } = req.body;
      const userId = req.user?.userId;

      if (!requests || !Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Requests array is required'
        });
      }

      if (requests.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 5 requests allowed per batch'
        });
      }

      // Validate each request
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        if (!request.query || request.query.trim().length === 0) {
          return res.status(400).json({
            success: false,
            message: `Request ${i + 1}: Query is required`
          });
        }
        if (request.query.length > 1000) {
          return res.status(400).json({
            success: false,
            message: `Request ${i + 1}: Query is too long (maximum 1000 characters)`
          });
        }
      }

      // Process requests sequentially to avoid overwhelming the AI service
      const responses = [];
      for (const request of requests) {
        try {
          const answer = await aiService.getTravelAnswer(
            request.query.trim(), 
            request.systemPrompt, 
            userId
          );
          responses.push({
            query: request.query.trim(),
            answer,
            success: true
          });
        } catch (error) {
          responses.push({
            query: request.query.trim(),
            error: error.message,
            success: false
          });
        }
      }

      Logger.info('Batch AI requests processed', { 
        userId, 
        requestCount: requests.length,
        successCount: responses.filter(r => r.success).length
      });

      res.json({
        success: true,
        responses,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error('Failed to process batch AI requests', { 
        userId: req.user?.userId, 
        error: error.message 
      });
      next(error);
    }
  }
}

module.exports = new AIController();

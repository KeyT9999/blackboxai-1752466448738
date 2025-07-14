const express = require('express');
const aiController = require('../controllers/aiController');
const { verifyToken, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Public AI routes (no authentication required)
router.get('/status', aiController.getServiceStatus);
router.get('/system-prompt', aiController.getDefaultSystemPrompt);
router.post('/validate-prompt', aiController.validateSystemPrompt);

// FAQ endpoint (public access for basic travel questions)
router.post('/faq', optionalAuth, aiController.getFAQResponse);

// Protected AI routes (authentication required for full features)
router.use(verifyToken);

// Main AI Travel Assistant
router.post('/assistant', aiController.aiTravelAssistant);

// Specialized AI services
router.post('/recommendations', aiController.getDestinationRecommendations);
router.post('/itinerary', aiController.getItinerarySuggestions);
router.post('/tips', aiController.getTravelTips);

// Batch processing
router.post('/batch', aiController.batchRequests);

module.exports = router;

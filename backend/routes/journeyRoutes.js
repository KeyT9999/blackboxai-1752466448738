const express = require('express');
const journeyController = require('../controllers/journeyController');
const { verifyToken, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (no authentication required, or optional auth)
router.get('/public', optionalAuth, journeyController.getPublicJourneys);
router.get('/search', optionalAuth, journeyController.searchJourneys);
router.get('/:journeyId', optionalAuth, journeyController.getJourneyById);
router.get('/:journeyId/stats', optionalAuth, journeyController.getJourneyStats);

// User-specific public routes
router.get('/user/:userId', optionalAuth, journeyController.getUserJourneys);

// Protected routes (authentication required)
router.use(verifyToken); // Apply authentication middleware to all routes below

// Journey CRUD operations
router.post('/', journeyController.createJourney);
router.put('/:journeyId', journeyController.updateJourney);
router.delete('/:journeyId', journeyController.deleteJourney);

// Current user's journeys
router.get('/my/journeys', journeyController.getMyJourneys);

// Journey collaboration
router.post('/:journeyId/collaborators', journeyController.addCollaborator);

// Journey interactions
router.post('/:journeyId/like', journeyController.toggleLike);
router.post('/:journeyId/comments', journeyController.addComment);

module.exports = router;

const express = require('express');
const userController = require('../controllers/userController');
const { verifyToken, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/verify-token', userController.verifyToken);

// Protected routes (authentication required)
router.use(verifyToken); // Apply authentication middleware to all routes below

// Current user profile routes
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/preferences', userController.updatePreferences);

// User search and discovery
router.get('/search', userController.searchUsers);

// Get user by ID (public profile view)
router.get('/:userId', userController.getUserById);
router.get('/:userId/stats', userController.getUserStats);

// Utility routes
router.post('/batch', userController.getUsersByIds);

module.exports = router;

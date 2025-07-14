const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  address: String,
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  description: String,
  photos: [String],
  visitDate: Date,
  duration: Number, // in hours
  cost: {
    amount: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  tips: [String]
});

const journeySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Journey title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Journey description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['editor', 'viewer'],
      default: 'viewer'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  destinations: [locationSchema],
  itinerary: [{
    day: {
      type: Number,
      required: true
    },
    date: Date,
    locations: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'destinations'
    }],
    notes: String
  }],
  duration: {
    days: Number,
    startDate: Date,
    endDate: Date
  },
  budget: {
    total: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    breakdown: {
      accommodation: Number,
      transportation: Number,
      food: Number,
      activities: Number,
      other: Number
    }
  },
  tags: [String],
  difficulty: {
    type: String,
    enum: ['easy', 'moderate', 'challenging', 'extreme'],
    default: 'moderate'
  },
  travelStyle: {
    type: String,
    enum: ['solo', 'couple', 'family', 'group', 'business'],
    default: 'solo'
  },
  status: {
    type: String,
    enum: ['planning', 'active', 'completed', 'cancelled'],
    default: 'planning'
  },
  visibility: {
    type: String,
    enum: ['public', 'friends', 'collaborators', 'private'],
    default: 'public'
  },
  coverImage: String,
  photos: [String],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  stats: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
journeySchema.index({ creator: 1, status: 1 });
journeySchema.index({ tags: 1 });
journeySchema.index({ 'destinations.coordinates': '2dsphere' });
journeySchema.index({ createdAt: -1 });
journeySchema.index({ 'stats.likes': -1 });

// Update stats when likes/comments change
journeySchema.pre('save', function(next) {
  if (this.isModified('likes')) {
    this.stats.likes = this.likes.length;
  }
  if (this.isModified('comments')) {
    this.stats.comments = this.comments.length;
  }
  next();
});

module.exports = mongoose.model('Journey', journeySchema);

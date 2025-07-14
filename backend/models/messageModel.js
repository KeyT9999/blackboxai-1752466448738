const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location', 'system'],
    default: 'text'
  },
  chatRoom: {
    type: String,
    required: true,
    index: true
  },
  chatType: {
    type: String,
    enum: ['group_planning', 'location_chat', 'qa_chat', 'direct'],
    required: true
  },
  // For group planning chats
  journeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Journey'
  },
  // For location-based chats
  location: {
    name: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  // For Q&A chats
  parentMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // File attachments
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'document', 'audio', 'video']
    },
    url: String,
    filename: String,
    size: Number
  }],
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // For system messages
  systemData: {
    action: String,
    data: mongoose.Schema.Types.Mixed
  },
  // Message editing
  editedAt: Date,
  originalContent: String,
  // Message deletion
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes for better query performance
messageSchema.index({ chatRoom: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ journeyId: 1, createdAt: -1 });
messageSchema.index({ 'location.coordinates': '2dsphere' });

// Virtual for reply count (for Q&A messages)
messageSchema.virtual('replyCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'parentMessage',
  count: true
});

// Method to mark message as read by user
messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({ user: userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(
    reaction => reaction.user.toString() === userId.toString()
  );
  
  if (existingReaction) {
    existingReaction.emoji = emoji;
  } else {
    this.reactions.push({ user: userId, emoji });
  }
  
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    reaction => reaction.user.toString() !== userId.toString()
  );
  return this.save();
};

module.exports = mongoose.model('Message', messageSchema);

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    required: [true, 'User ID is required'],
    validate: {
      validator: function (v) {
        // Allow both ObjectId format and string format (for development/testing)
        return mongoose.Types.ObjectId.isValid(v) ||
          (typeof v === 'string' && v.length >= 3 && v.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(v));
      },
      message: 'Invalid userId format'
    }
  },
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [100, 'Project name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
  // Let MongoDB auto-generate ObjectId for _id
});

// Index for efficient queries
projectSchema.index({ userId: 1, createdAt: -1 });
projectSchema.index({ userId: 1, lastAccessedAt: -1 });

// Update lastAccessedAt when project is accessed
projectSchema.methods.updateLastAccessed = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Project', projectSchema);
const mongoose = require('mongoose');

const fileMetadataSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project ID is required']
  },
  name: {
    type: String,
    required: [true, 'File name is required'],
    trim: true,
    maxlength: [255, 'File name cannot exceed 255 characters']
  },
  type: {
    type: String,
    required: [true, 'File type is required'],
    enum: ['file', 'folder'],
    default: 'file'
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileMetadata',
    default: null // null for root level files/folders
  },
  s3Key: {
    type: String,
    // Only files have s3Key, folders don't store content
    required: function() {
      return this.type === 'file';
    }
  },
  size: {
    type: Number,
    default: 0,
    min: [0, 'File size cannot be negative']
  },
  mimeType: {
    type: String,
    default: 'text/plain'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
fileMetadataSchema.index({ projectId: 1, parentId: 1 });
fileMetadataSchema.index({ projectId: 1, type: 1 });
fileMetadataSchema.index({ s3Key: 1 }, { sparse: true });

// Validate that folders don't have s3Key
fileMetadataSchema.pre('save', function(next) {
  if (this.type === 'folder' && this.s3Key) {
    const error = new Error('Folders cannot have s3Key');
    return next(error);
  }
  
  if (this.type === 'file' && !this.s3Key) {
    const error = new Error('Files must have s3Key');
    return next(error);
  }
  
  next();
});

// Static method to find all children of a folder (recursive)
fileMetadataSchema.statics.findAllChildren = async function(parentId) {
  const children = await this.find({ parentId });
  let allChildren = [...children];
  
  for (const child of children) {
    if (child.type === 'folder') {
      const grandChildren = await this.findAllChildren(child._id);
      allChildren = allChildren.concat(grandChildren);
    }
  }
  
  return allChildren;
};

// Instance method to get full path
fileMetadataSchema.methods.getFullPath = async function() {
  if (!this.parentId) {
    return this.name;
  }
  
  const parent = await this.constructor.findById(this.parentId);
  if (!parent) {
    return this.name;
  }
  
  const parentPath = await parent.getFullPath();
  return `${parentPath}/${this.name}`;
};

module.exports = mongoose.model('FileMetadata', fileMetadataSchema);
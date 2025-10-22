const FileMetadata = require('../models/FileMetadata');
const Project = require('../models/Project');
const { handleDatabaseOperation } = require('../utils/database');
const s3Service = require('../services/s3Service');
const { v4: uuidv4 } = require('uuid');

/**
 * Get all files for a project
 */
const getProjectFiles = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project exists
    const project = await handleDatabaseOperation(async () => {
      const mongoose = require('mongoose');
      let proj = null;
      
      // Try different approaches to find the project
      try {
        // Method 1: Try as ObjectId if it's valid format
        if (mongoose.Types.ObjectId.isValid(projectId) && projectId.length === 24) {
          proj = await Project.findById(projectId);
        }
        
        // Method 2: If not found, try as string in _id field
        if (!proj) {
          proj = await Project.findOne({ _id: projectId });
        }
        
      } catch (castError) {
        // If casting fails, try finding by string
        proj = await Project.findOne({ _id: projectId });
      }
      if (!proj) {
        const error = new Error('Project not found');
        error.statusCode = 404;
        error.code = 'PROJECT_NOT_FOUND';
        throw error;
      }
      return proj;
    }, 'Failed to find project');

    // Get all files for the project
    const files = await handleDatabaseOperation(async () => {
      return await FileMetadata.find({ projectId })
        .sort({ type: 1, name: 1 }) // Folders first, then files, alphabetically
        .select('-__v');
    }, 'Failed to fetch project files');

    res.json({
      success: true,
      data: {
        files,
        count: files.length,
        projectId
      }
    });

  } catch (error) {
    console.error('Get project files error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'FETCH_FILES_FAILED',
        message: error.message || 'Failed to fetch project files'
      }
    });
  }
};

/**
 * Create a new file or folder
 */
const createFile = async (req, res) => {
  try {
    const { projectId, name, type, parentId, content } = req.validatedData;

    // Verify project exists - handle both ObjectId and string formats
    await handleDatabaseOperation(async () => {
      const mongoose = require('mongoose');
      let project = null;
      
      // Try different approaches to find the project
      try {
        // Method 1: Try as ObjectId if it's valid format
        if (mongoose.Types.ObjectId.isValid(projectId) && projectId.length === 24) {
          project = await Project.findById(projectId);
        }
        
        // Method 2: If not found, try as string in _id field
        if (!project) {
          project = await Project.findOne({ _id: projectId });
        }
        
        // Method 3: If still not found, try converting string to ObjectId
        if (!project && mongoose.Types.ObjectId.isValid(projectId)) {
          const objectId = new mongoose.Types.ObjectId(projectId);
          project = await Project.findById(objectId);
        }
        
      } catch (castError) {
        // If casting fails, try finding by string
        project = await Project.findOne({ _id: projectId });
      }
      
      if (!project) {
        console.log('🔍 Project not found. Searched for:', projectId);
        console.log('🔍 ProjectId type:', typeof projectId);
        console.log('🔍 ProjectId length:', projectId?.length);
        console.log('🔍 Is valid ObjectId:', mongoose.Types.ObjectId.isValid(projectId));
        
        const error = new Error('Project not found');
        error.statusCode = 404;
        error.code = 'PROJECT_NOT_FOUND';
        throw error;
      }
      
      console.log('✅ Project found:', project._id);
      return project;
    }, 'Failed to find project');

    // Verify parent folder exists if parentId is provided
    if (parentId) {
      await handleDatabaseOperation(async () => {
        const parent = await FileMetadata.findOne({ 
          _id: parentId, 
          projectId, 
          type: 'folder' 
        });
        if (!parent) {
          const error = new Error('Parent folder not found');
          error.statusCode = 404;
          error.code = 'PARENT_NOT_FOUND';
          throw error;
        }
        return parent;
      }, 'Failed to find parent folder');
    }

    // Check for duplicate names in the same directory
    const existingFile = await FileMetadata.findOne({
      projectId,
      name,
      parentId: parentId || null
    });

    if (existingFile) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'FILE_EXISTS',
          message: `A ${type} with the name "${name}" already exists in this location`
        }
      });
    }

    let fileMetadata;
    let s3Key = null;

    if (type === 'file') {
      // Generate S3 key for file
      const fileId = uuidv4();
      s3Key = s3Service.generateS3Key(projectId, fileId, name);

      // Upload content to S3
      try {
        await s3Service.uploadFile(s3Key, content || '', getMimeType(name));
      } catch (s3Error) {
        console.log(`⚠️  S3 upload skipped for ${name} (development mode)`);
        // Continue without S3 in development
      }

      // Create file metadata
      fileMetadata = await handleDatabaseOperation(async () => {
        return await FileMetadata.create({
          projectId,
          name,
          type,
          parentId: parentId || null,
          s3Key,
          size: Buffer.byteLength(content || '', 'utf8'),
          mimeType: getMimeType(name)
        });
      }, 'Failed to create file metadata');

    } else {
      // Create folder metadata (no S3 storage)
      fileMetadata = await handleDatabaseOperation(async () => {
        return await FileMetadata.create({
          projectId,
          name,
          type,
          parentId: parentId || null
        });
      }, 'Failed to create folder metadata');
    }

    res.status(201).json({
      success: true,
      data: {
        file: fileMetadata,
        message: `${type === 'file' ? 'File' : 'Folder'} created successfully`
      }
    });

  } catch (error) {
    console.error('Create file error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'CREATE_FILE_FAILED',
        message: error.message || 'Failed to create file'
      }
    });
  }
};

/**
 * Get file content by ID
 */
const getFile = async (req, res) => {
  try {
    const { id } = req.params;

    // Get file metadata
    const fileMetadata = await handleDatabaseOperation(async () => {
      const file = await FileMetadata.findById(id);
      if (!file) {
        const error = new Error('File not found');
        error.statusCode = 404;
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return file;
    }, 'Failed to find file');

    if (fileMetadata.type === 'folder') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot get content of a folder'
        }
      });
    }

    // Get file content from S3
    let content = '';
    if (fileMetadata.s3Key) {
      try {
        content = await s3Service.getFile(fileMetadata.s3Key);
      } catch (s3Error) {
        console.log(`⚠️  S3 download failed for ${fileMetadata.name}, returning empty content`);
        content = ''; // Return empty content if S3 fails
      }
    }

    res.json({
      success: true,
      data: {
        file: {
          ...fileMetadata.toObject(),
          content
        }
      }
    });

  } catch (error) {
    console.error('Get file error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'FETCH_FILE_FAILED',
        message: error.message || 'Failed to fetch file'
      }
    });
  }
};

/**
 * Update file content or metadata
 */
const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content, parentId } = req.validatedData;

    // Get existing file metadata
    const fileMetadata = await handleDatabaseOperation(async () => {
      const file = await FileMetadata.findById(id);
      if (!file) {
        const error = new Error('File not found');
        error.statusCode = 404;
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return file;
    }, 'Failed to find file');

    // Check for name conflicts if name is being changed
    if (name && name !== fileMetadata.name) {
      const existingFile = await FileMetadata.findOne({
        projectId: fileMetadata.projectId,
        name,
        parentId: parentId !== undefined ? parentId : fileMetadata.parentId,
        _id: { $ne: id }
      });

      if (existingFile) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'FILE_EXISTS',
            message: `A ${fileMetadata.type} with the name "${name}" already exists in this location`
          }
        });
      }
    }

    // Verify parent folder exists if parentId is being changed
    if (parentId !== undefined && parentId !== fileMetadata.parentId) {
      if (parentId) {
        await handleDatabaseOperation(async () => {
          const parent = await FileMetadata.findOne({ 
            _id: parentId, 
            projectId: fileMetadata.projectId, 
            type: 'folder' 
          });
          if (!parent) {
            const error = new Error('Parent folder not found');
            error.statusCode = 404;
            error.code = 'PARENT_NOT_FOUND';
            throw error;
          }
          return parent;
        }, 'Failed to find parent folder');
      }
    }

    // Update file content in S3 if content is provided and it's a file
    if (content !== undefined && fileMetadata.type === 'file' && fileMetadata.s3Key) {
      try {
        await s3Service.uploadFile(fileMetadata.s3Key, content, fileMetadata.mimeType);
      } catch (s3Error) {
        console.log(`⚠️  S3 update skipped for ${fileMetadata.name} (development mode)`);
      }
    }

    // Update metadata
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (parentId !== undefined) updateData.parentId = parentId;
    if (content !== undefined && fileMetadata.type === 'file') {
      updateData.size = Buffer.byteLength(content, 'utf8');
    }

    const updatedFile = await handleDatabaseOperation(async () => {
      return await FileMetadata.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).select('-__v');
    }, 'Failed to update file metadata');

    res.json({
      success: true,
      data: {
        file: updatedFile,
        message: `${fileMetadata.type === 'file' ? 'File' : 'Folder'} updated successfully`
      }
    });

  } catch (error) {
    console.error('Update file error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'UPDATE_FILE_FAILED',
        message: error.message || 'Failed to update file'
      }
    });
  }
};

/**
 * Delete file or folder (recursive for folders)
 */
const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    // Get file metadata
    const fileMetadata = await handleDatabaseOperation(async () => {
      const file = await FileMetadata.findById(id);
      if (!file) {
        const error = new Error('File not found');
        error.statusCode = 404;
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return file;
    }, 'Failed to find file');

    let deletedFiles = [];
    let s3Keys = [];

    if (fileMetadata.type === 'folder') {
      // Get all children recursively
      const allChildren = await FileMetadata.findAllChildren(id);
      deletedFiles = [fileMetadata, ...allChildren];
      
      // Collect S3 keys from files (not folders)
      s3Keys = allChildren
        .filter(file => file.s3Key)
        .map(file => file.s3Key);

    } else {
      // Single file
      deletedFiles = [fileMetadata];
      if (fileMetadata.s3Key) {
        s3Keys = [fileMetadata.s3Key];
      }
    }

    // Delete files from S3
    if (s3Keys.length > 0) {
      try {
        await s3Service.deleteFiles(s3Keys);
      } catch (s3Error) {
        console.error('S3 deletion error (continuing with database cleanup):', s3Error);
      }
    }

    // Delete from database
    if (fileMetadata.type === 'folder') {
      // Delete all children first, then the folder
      const childIds = deletedFiles.slice(1).map(file => file._id);
      if (childIds.length > 0) {
        await handleDatabaseOperation(async () => {
          await FileMetadata.deleteMany({ _id: { $in: childIds } });
        }, 'Failed to delete child files');
      }
    }

    // Delete the main file/folder
    await handleDatabaseOperation(async () => {
      await FileMetadata.findByIdAndDelete(id);
    }, 'Failed to delete file');

    res.json({
      success: true,
      data: {
        message: `${fileMetadata.type === 'file' ? 'File' : 'Folder'} deleted successfully`,
        deletedFiles: deletedFiles.length,
        deletedS3Objects: s3Keys.length
      }
    });

  } catch (error) {
    console.error('Delete file error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'DELETE_FILE_FAILED',
        message: error.message || 'Failed to delete file'
      }
    });
  }
};

/**
 * Helper function to determine MIME type from file name
 */
function getMimeType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'js': 'application/javascript',
    'jsx': 'application/javascript',
    'ts': 'application/typescript',
    'tsx': 'application/typescript',
    'css': 'text/css',
    'html': 'text/html',
    'htm': 'text/html',
    'json': 'application/json',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'xml': 'application/xml',
    'svg': 'image/svg+xml'
  };
  
  return mimeTypes[extension] || 'text/plain';
}

module.exports = {
  getProjectFiles,
  createFile,
  getFile,
  updateFile,
  deleteFile
};
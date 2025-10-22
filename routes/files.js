const express = require('express');
const router = express.Router();
const { fileSchemas, validate, validateObjectId } = require('../utils/validation');
const {
  getProjectFiles,
  createFile,
  getFile,
  updateFile,
  deleteFile
} = require('../controllers/fileController');

// Get all files for a project
router.get('/project/:projectId', validateObjectId('projectId'), getProjectFiles);

// Create new file or folder
router.post('/', validate(fileSchemas.create), createFile);

// Get file content by ID
router.get('/:id', validateObjectId(), getFile);

// Update file content or metadata
router.put('/:id', validateObjectId(), validate(fileSchemas.update), updateFile);

// Delete file or folder (recursive for folders)
router.delete('/:id', validateObjectId(), deleteFile);

module.exports = router;
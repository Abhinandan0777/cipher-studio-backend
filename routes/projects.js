const express = require('express');
const router = express.Router();
const { projectSchemas, validate, validateObjectId, validateUserId } = require('../utils/validation');
const {
  createProject,
  getUserProjects,
  getProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');

// Create new project
router.post('/', validate(projectSchemas.create), createProject);

// Get projects by user ID
router.get('/user/:userId', validateUserId('userId'), getUserProjects);

// Get specific project by ID
router.get('/:id', validateObjectId(), getProject);

// Update project
router.put('/:id', validateObjectId(), validate(projectSchemas.update), updateProject);

// Delete project and all associated files
router.delete('/:id', validateObjectId(), deleteProject);

module.exports = router;
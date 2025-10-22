const Project = require('../models/Project');
const FileMetadata = require('../models/FileMetadata');
const { handleDatabaseOperation } = require('../utils/database');
const s3Service = require('../services/s3Service');

/**
 * Create a new project with default React files
 */
const createProject = async (req, res) => {
  try {
    const { name, description, userId } = req.validatedData;

    // Create project (MongoDB will auto-generate ObjectId)
    const project = await Project.create({
      name,
      description,
      userId
    });

    // Create default React files for the new project
    const FileMetadata = require('../models/FileMetadata');
    const s3Service = require('../services/s3Service');
    const { v4: uuidv4 } = require('uuid');

    const defaultFiles = [
      {
        name: 'App.js',
        content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>${name}</h1>
        <p>Welcome to your new React project!</p>
        <p>Start editing to see your changes live!</p>
        <button className="demo-button" onClick={() => alert('Hello from ${name}!')}>
          Click me!
        </button>
      </header>
    </div>
  );
}

export default App;`
      },
      {
        name: 'App.css',
        content: `.App {
  text-align: center;
}

.App-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px;
  color: white;
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  margin: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.App-header h1 {
  margin: 0 0 20px 0;
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.App-header p {
  margin: 8px 0;
  font-size: 1.1rem;
  opacity: 0.9;
}

.demo-button {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 25px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 20px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
}

.demo-button:hover {
  background: #ff5252;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 107, 107, 0.6);
}`
      },
      {
        name: 'index.js',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
      }
    ];

    // Create each default file
    for (const fileData of defaultFiles) {
      try {
        const fileId = uuidv4();
        const s3Key = s3Service.generateS3Key(project._id, fileId, fileData.name);

        // Upload to S3
        try {
          await s3Service.uploadFile(s3Key, fileData.content, getMimeType(fileData.name));
        } catch (s3Error) {
          console.log(`⚠️  S3 upload skipped for ${fileData.name} (development mode)`);
        }

        // Create file metadata
        await FileMetadata.create({
          projectId: project._id,
          name: fileData.name,
          type: 'file',
          parentId: null,
          s3Key,
          size: Buffer.byteLength(fileData.content, 'utf8'),
          mimeType: getMimeType(fileData.name)
        });

        console.log(`✅ Created default file: ${fileData.name}`);
      } catch (fileError) {
        console.error(`❌ Failed to create default file ${fileData.name}:`, fileError);
      }
    }

    // Note: Default files will be created by the frontend to avoid conflicts

    res.status(201).json({
      success: true,
      data: {
        project,
        message: 'Project created successfully with default React files'
      }
    });

  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROJECT_CREATION_FAILED',
        message: 'Failed to create project',
        details: error.message
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

/**
 * Get projects by user ID
 */
const getUserProjects = async (req, res) => {
  try {
    const { userId } = req.params;
    const { sortBy = 'lastAccessedAt', order = 'desc', limit = 50 } = req.query;

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortOptions = { [sortBy]: sortOrder };

    const projects = await Project.find({ userId })
      .sort(sortOptions)
      .limit(parseInt(limit))
      .select('-__v');

    res.json({
      success: true,
      data: {
        projects,
        count: projects.length
      }
    });

  } catch (error) {
    console.error('Get user projects error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_PROJECTS_FAILED',
        message: 'Failed to fetch projects',
        details: error.message
      }
    });
  }
};

/**
 * Get specific project by ID
 */
const getProject = async (req, res) => {
  try {
    const { id } = req.params;

    const mongoose = require('mongoose');
    let project = null;
    
    // Try different approaches to find the project
    try {
      // Method 1: Try as ObjectId if it's valid format
      if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
        project = await Project.findById(id).select('-__v');
      }
      
      // Method 2: If not found, try as string in _id field
      if (!project) {
        project = await Project.findOne({ _id: id }).select('-__v');
      }
      
    } catch (castError) {
      // If casting fails, try finding by string
      project = await Project.findOne({ _id: id }).select('-__v');
    }
    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    // Update last accessed time
    try {
      await project.updateLastAccessed();
    } catch (updateError) {
      console.warn('Failed to update last accessed time:', updateError);
      // Don't fail the request if we can't update access time
    }

    res.json({
      success: true,
      data: { project }
    });

  } catch (error) {
    console.error('Get project error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'FETCH_PROJECT_FAILED',
        message: error.message || 'Failed to fetch project'
      }
    });
  }
};

/**
 * Update project
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.validatedData;

    const mongoose = require('mongoose');
    let project = null;
    
    // Try different approaches to update the project
    try {
      // Method 1: Try as ObjectId if it's valid format
      if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
        project = await Project.findByIdAndUpdate(
          id,
          { ...updateData, lastAccessedAt: new Date() },
          { new: true, runValidators: true }
        ).select('-__v');
      }
      
      // Method 2: If not found, try as string in _id field
      if (!project) {
        project = await Project.findOneAndUpdate(
          { _id: id },
          { ...updateData, lastAccessedAt: new Date() },
          { new: true, runValidators: true }
        ).select('-__v');
      }
      
    } catch (castError) {
      // If casting fails, try updating by string
      project = await Project.findOneAndUpdate(
        { _id: id },
        { ...updateData, lastAccessedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-__v');
    }

    if (!project) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        project,
        message: 'Project updated successfully'
      }
    });

  } catch (error) {
    console.error('Update project error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'UPDATE_PROJECT_FAILED',
        message: error.message || 'Failed to update project'
      }
    });
  }
};

/**
 * Delete project and all associated files
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // First, get the project to ensure it exists
    const project = await handleDatabaseOperation(async () => {
      const mongoose = require('mongoose');
      let proj = null;
      
      // Try different approaches to find the project
      try {
        // Method 1: Try as ObjectId if it's valid format
        if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
          proj = await Project.findById(id);
        }
        
        // Method 2: If not found, try as string in _id field
        if (!proj) {
          proj = await Project.findOne({ _id: id });
        }
        
      } catch (castError) {
        // If casting fails, try finding by string
        proj = await Project.findOne({ _id: id });
      }
      if (!proj) {
        const error = new Error('Project not found');
        error.statusCode = 404;
        error.code = 'PROJECT_NOT_FOUND';
        throw error;
      }
      return proj;
    }, 'Failed to find project for deletion');

    // Get all files associated with the project
    const files = await handleDatabaseOperation(async () => {
      return await FileMetadata.find({ projectId: id });
    }, 'Failed to fetch project files for deletion');

    // Delete all files from S3
    const s3Keys = files
      .filter(file => file.s3Key) // Only files have s3Key, not folders
      .map(file => file.s3Key);

    if (s3Keys.length > 0) {
      try {
        await s3Service.deleteFiles(s3Keys);
      } catch (s3Error) {
        console.error('S3 deletion error (continuing with database cleanup):', s3Error);
        // Continue with database cleanup even if S3 fails
      }
    }

    // Delete all file metadata from database
    await handleDatabaseOperation(async () => {
      await FileMetadata.deleteMany({ projectId: id });
    }, 'Failed to delete project files from database');

    // Delete the project
    await handleDatabaseOperation(async () => {
      const mongoose = require('mongoose');
      
      // Try different approaches to delete the project
      try {
        // Method 1: Try as ObjectId if it's valid format
        if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
          await Project.findByIdAndDelete(id);
        } else {
          // Method 2: Delete by string _id
          await Project.findOneAndDelete({ _id: id });
        }
        
      } catch (castError) {
        // If casting fails, try deleting by string
        await Project.findOneAndDelete({ _id: id });
      }
    }, 'Failed to delete project');

    res.json({
      success: true,
      data: {
        message: 'Project and all associated files deleted successfully',
        deletedFiles: files.length,
        deletedS3Objects: s3Keys.length
      }
    });

  } catch (error) {
    console.error('Delete project error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'DELETE_PROJECT_FAILED',
        message: error.message || 'Failed to delete project'
      }
    });
  }
};

/**
 * Helper function to create default React project files
 */
async function createDefaultProjectFiles(projectId) {
  const defaultFiles = [
    {
      name: 'src',
      type: 'folder',
      parentId: null
    },
    {
      name: 'public',
      type: 'folder',
      parentId: null
    }
  ];

  // Create folders first
  const createdFolders = {};
  for (const folder of defaultFiles) {
    const fileMetadata = await FileMetadata.create({
      projectId,
      name: folder.name,
      type: folder.type,
      parentId: folder.parentId
    });
    createdFolders[folder.name] = fileMetadata._id;
  }

  // Create default files with content
  const defaultFilesWithContent = [
    {
      name: 'App.js',
      type: 'file',
      parentId: createdFolders['src'],
      content: `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to CipherStudio</h1>
        <p>Start editing to see your changes live!</p>
      </header>
    </div>
  );
}

export default App;`
    },
    {
      name: 'App.css',
      type: 'file',
      parentId: createdFolders['src'],
      content: `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.App-header h1 {
  margin-bottom: 16px;
}

.App-header p {
  font-size: 18px;
}`
    },
    {
      name: 'index.js',
      type: 'file',
      parentId: createdFolders['src'],
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
    },
    {
      name: 'index.html',
      type: 'file',
      parentId: createdFolders['public'],
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CipherStudio Project</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`
    }
  ];

  // Create files with S3 storage
  for (const file of defaultFilesWithContent) {
    const s3Key = s3Service.generateS3Key(projectId, 'default', file.name);

    try {
      // Upload content to S3 (will fail gracefully in development without AWS)
      try {
        await s3Service.uploadFile(s3Key, file.content, 'text/plain');
      } catch (s3Error) {
        console.log(`⚠️  S3 upload skipped for ${file.name} (development mode)`);
      }

      // Create file metadata
      await FileMetadata.create({
        projectId,
        name: file.name,
        type: file.type,
        parentId: file.parentId,
        s3Key,
        size: Buffer.byteLength(file.content, 'utf8'),
        mimeType: file.name.endsWith('.js') ? 'application/javascript' :
          file.name.endsWith('.css') ? 'text/css' :
            file.name.endsWith('.html') ? 'text/html' : 'text/plain'
      });
    } catch (error) {
      console.error(`Failed to create default file ${file.name}:`, error);
      // Continue creating other files even if one fails
    }
  }
}

module.exports = {
  createProject,
  getUserProjects,
  getProject,
  updateProject,
  deleteProject
};
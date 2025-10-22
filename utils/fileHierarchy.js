const FileMetadata = require('../models/FileMetadata');

/**
 * Build hierarchical tree from flat file array
 */
const buildFileTree = (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  // Create a map for quick lookup
  const fileMap = new Map();
  const rootFiles = [];

  // First pass: create map and identify root files
  files.forEach(file => {
    fileMap.set(file._id.toString(), {
      ...file.toObject(),
      children: []
    });

    if (!file.parentId) {
      rootFiles.push(file._id.toString());
    }
  });

  // Second pass: build parent-child relationships
  files.forEach(file => {
    const fileId = file._id.toString();
    const parentId = file.parentId ? file.parentId.toString() : null;
    
    if (parentId && fileMap.has(parentId)) {
      const parent = fileMap.get(parentId);
      const child = fileMap.get(fileId);
      parent.children.push(child);
    }
  });

  // Sort children: folders first, then files, alphabetically
  const sortChildren = (node) => {
    if (node.children && node.children.length > 0) {
      node.children.sort((a, b) => {
        // Folders first
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
      
      // Recursively sort children
      node.children.forEach(sortChildren);
    }
  };

  // Get root nodes and sort them
  const rootNodes = rootFiles.map(id => fileMap.get(id));
  rootNodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Sort all children recursively
  rootNodes.forEach(sortChildren);

  return rootNodes;
};

/**
 * Validate file hierarchy operations
 */
const validateHierarchyOperation = async (fileId, newParentId, projectId) => {
  // Cannot move a folder into itself or its descendants
  if (newParentId) {
    const file = await FileMetadata.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    if (file.type === 'folder') {
      // Check if newParentId is a descendant of fileId
      const isDescendant = await isFileDescendant(newParentId, fileId);
      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }

    // Verify new parent exists and is a folder
    const newParent = await FileMetadata.findOne({
      _id: newParentId,
      projectId,
      type: 'folder'
    });
    
    if (!newParent) {
      throw new Error('New parent folder not found');
    }
  }

  return true;
};

/**
 * Check if a file is a descendant of another file
 */
const isFileDescendant = async (fileId, ancestorId) => {
  const file = await FileMetadata.findById(fileId);
  if (!file || !file.parentId) {
    return false;
  }

  if (file.parentId.toString() === ancestorId.toString()) {
    return true;
  }

  return await isFileDescendant(file.parentId, ancestorId);
};

/**
 * Get all descendants of a folder
 */
const getAllDescendants = async (folderId) => {
  const descendants = [];
  
  const getChildren = async (parentId) => {
    const children = await FileMetadata.find({ parentId });
    
    for (const child of children) {
      descendants.push(child);
      
      if (child.type === 'folder') {
        await getChildren(child._id);
      }
    }
  };
  
  await getChildren(folderId);
  return descendants;
};

/**
 * Calculate folder size (sum of all file sizes in folder)
 */
const calculateFolderSize = async (folderId) => {
  const descendants = await getAllDescendants(folderId);
  const files = descendants.filter(item => item.type === 'file');
  
  return files.reduce((total, file) => total + (file.size || 0), 0);
};

/**
 * Get file path from root
 */
const getFilePath = async (fileId) => {
  const path = [];
  let currentFile = await FileMetadata.findById(fileId);
  
  while (currentFile) {
    path.unshift(currentFile.name);
    
    if (currentFile.parentId) {
      currentFile = await FileMetadata.findById(currentFile.parentId);
    } else {
      break;
    }
  }
  
  return path.join('/');
};

/**
 * Check for naming conflicts
 */
const checkNamingConflict = async (projectId, name, parentId, excludeId = null) => {
  const query = {
    projectId,
    name,
    parentId: parentId || null
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existingFile = await FileMetadata.findOne(query);
  return !!existingFile;
};

/**
 * Generate unique name if conflict exists
 */
const generateUniqueName = async (projectId, baseName, parentId, excludeId = null) => {
  let name = baseName;
  let counter = 1;
  
  while (await checkNamingConflict(projectId, name, parentId, excludeId)) {
    const extension = baseName.includes('.') ? 
      '.' + baseName.split('.').pop() : '';
    const nameWithoutExt = baseName.includes('.') ? 
      baseName.substring(0, baseName.lastIndexOf('.')) : baseName;
    
    name = `${nameWithoutExt} (${counter})${extension}`;
    counter++;
  }
  
  return name;
};

module.exports = {
  buildFileTree,
  validateHierarchyOperation,
  isFileDescendant,
  getAllDescendants,
  calculateFolderSize,
  getFilePath,
  checkNamingConflict,
  generateUniqueName
};
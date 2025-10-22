# CipherStudio Backend API

Backend API server for CipherStudio - a browser-based React IDE.

## Features

- Express.js REST API server
- MongoDB integration with Mongoose
- AWS S3 file storage service
- JWT authentication
- Request validation with Joi
- Comprehensive error handling
- CORS support for frontend integration

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

3. Start the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS
- `MONGODB_URI` - MongoDB connection string
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region
- `S3_BUCKET_NAME` - S3 bucket name
- `JWT_SECRET` - JWT signing secret
- `JWT_EXPIRE` - JWT expiration time

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Projects
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project by ID
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Files
- `GET /api/files/project/:projectId` - Get project files
- `POST /api/files` - Create file/folder
- `GET /api/files/:id` - Get file content
- `PUT /api/files/:id` - Update file
- `DELETE /api/files/:id` - Delete file/folder

## Database Models

### User
- email (unique)
- passwordHash
- timestamps

### Project
- userId (ref to User)
- name
- description
- lastAccessedAt
- timestamps

### FileMetadata
- projectId (ref to Project)
- name
- type (file/folder)
- parentId (ref to FileMetadata, null for root)
- s3Key (only for files)
- size
- mimeType
- timestamps

## File Storage

Files are stored in AWS S3 with the following key structure:
```
projects/{projectId}/files/{fileId}/{fileName}
```

Folders only store metadata in MongoDB, while files store content in S3.

## Development

The server includes graceful error handling and will continue running in development mode even without database connectivity for easier local development.

To test the server:
```bash
node test-server.js
```
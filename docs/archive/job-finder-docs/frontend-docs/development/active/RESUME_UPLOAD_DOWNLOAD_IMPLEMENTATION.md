# Resume Upload/Download Implementation

## Overview

This document outlines the implementation of resume upload and download functionality in the job-finder-FE application, inspired by the portfolio repository's experience tab.

## Frontend Implementation

### Components Added

1. **FileUpload Component** (`src/components/ui/file-upload.tsx`)
   - Drag and drop file upload interface
   - File validation (type, size)
   - Upload progress tracking
   - Error handling and success states

2. **ResumeManager Component** (`src/pages/content-items/components/ResumeManager.tsx`)
   - Complete resume management interface
   - File upload, download, and deletion
   - File listing with metadata
   - Integration with file API client

3. **File API Client** (`src/api/file-client.ts`)
   - RESTful API client for file operations
   - Upload, download, list, and delete operations
   - Type-safe interfaces for all operations

### Integration Points

1. **ContentItemsPage** (`src/pages/content-items/ContentItemsPage.tsx`)
   - Added ResumeManager component for editors
   - Added direct resume download button
   - Integrated with existing export/import functionality

2. **API Configuration** (`src/config/api.ts`)
   - Added `manageFiles` endpoint configuration
   - Environment-specific URL handling

## Backend Requirements

### Required Cloud Function: `manageFiles`

The frontend expects a Firebase Cloud Function named `manageFiles` (or `manageFiles-staging` for staging) that handles:

#### Endpoints

1. **POST /manageFiles** - Upload file
   - Accepts multipart/form-data
   - Returns file metadata and download URL
   - Supports file validation and size limits

2. **GET /manageFiles** - List files
   - Returns array of file metadata
   - Supports filtering by file type/tags

3. **GET /manageFiles/{fileId}** - Get file metadata
   - Returns specific file information

4. **GET /manageFiles/{fileId}/download** - Get download URL
   - Returns signed URL for file download

5. **DELETE /manageFiles/{fileId}** - Delete file
   - Removes file from storage

#### Request/Response Format

```typescript
// Upload Request (multipart/form-data)
{
  file: File,
  description?: string,
  tags?: string[],
  isPublic?: boolean
}

// Upload Response
{
  success: boolean,
  data?: {
    fileId: string,
    fileName: string,
    fileSize: number,
    fileType: string,
    downloadUrl: string,
    uploadDate: string
  },
  error?: string
}

// List Response
{
  success: boolean,
  data?: {
    files: Array<{
      fileId: string,
      fileName: string,
      fileSize: number,
      fileType: string,
      downloadUrl: string,
      uploadDate: string
    }>
  },
  error?: string
}
```

### Storage Requirements

- Firebase Storage bucket for file storage
- File organization by user ID
- Support for PDF, DOC, DOCX files
- File size limits (10MB default)
- Automatic cleanup of orphaned files

### Security Considerations

- User authentication required for all operations
- File access restricted to file owner
- File type validation on upload
- Virus scanning (recommended)
- Rate limiting for uploads

## Static Resume Download

The implementation also includes a static resume download feature:

- Static `resume.pdf` file in `/public/resume.pdf`
- Direct download via "Download Resume" button
- No backend required for static download

## Usage

### For Editors

1. Navigate to Experience/Content Items page
2. Use the Resume Management section to:
   - Upload new resume files
   - Download existing files
   - Delete unwanted files
3. Use the "Download Resume" button for static resume

### For Non-Editors

- Can download static resume via "Download Resume" button
- No access to file management features

## Testing

### Frontend Testing

1. File upload with various file types
2. File size validation
3. Drag and drop functionality
4. Error handling for failed uploads
5. File listing and metadata display
6. Download functionality

### Backend Testing

1. File upload to Firebase Storage
2. File metadata storage in Firestore
3. Signed URL generation for downloads
4. File deletion and cleanup
5. User authentication and authorization

## Future Enhancements

1. **File Versioning** - Track multiple versions of resumes
2. **File Sharing** - Generate shareable links for resumes
3. **File Analytics** - Track download counts and usage
4. **Bulk Operations** - Upload/download multiple files
5. **File Preview** - In-browser PDF preview
6. **File Conversion** - Convert between PDF/DOC formats
7. **Integration with Document Generator** - Use uploaded resumes as templates

## Migration from Portfolio

The implementation draws inspiration from the portfolio repository's experience tab:

- Similar file upload/download patterns
- Consistent UI/UX design
- Reusable components for file management
- Integration with existing content management system

## Dependencies

### Frontend Dependencies

- React 18+
- TypeScript
- Tailwind CSS
- Radix UI components
- Lucide React icons

### Backend Dependencies

- Firebase Cloud Functions
- Firebase Storage
- Firebase Authentication
- Node.js runtime
- File processing libraries (multer, etc.)

## Configuration

### Environment Variables

```bash
# Firebase project configuration
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket

# API endpoints
VITE_API_BASE_URL=https://your-region-your-project.cloudfunctions.net
```

### Firebase Rules

```javascript
// Storage rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /files/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file size limits
   - Verify file type is supported
   - Ensure user is authenticated

2. **Download Not Working**
   - Verify file exists in storage
   - Check download URL generation
   - Ensure proper permissions

3. **File Not Listed**
   - Check file metadata in Firestore
   - Verify user ownership
   - Check file type filtering

### Debug Steps

1. Check browser console for errors
2. Verify API endpoint responses
3. Check Firebase Storage and Firestore
4. Test with different file types and sizes
5. Verify authentication state

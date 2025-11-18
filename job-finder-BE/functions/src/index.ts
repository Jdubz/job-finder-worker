/**
 * Firebase Cloud Functions for Job Finder Application
 * 
 * This file exports all Cloud Functions for the Job Finder backend.
 * Functions are organized by feature area (job queue, matches, config, etc.)
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export generator functions
export { manageGenerator } from './generator';

// TODO: Export job matches functions
// export { getMatches, updateMatch } from './job-matches';

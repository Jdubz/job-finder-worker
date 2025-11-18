/**
 * Job Queue Domain Types
 * 
 * Re-exports from @shared/types for backward compatibility
 * and additional job-finder-BE specific extensions
 */

export type {
  QueueStatus,
  QueueItemType,
  QueueSource,
  QueueItem,
  StopList,
  QueueSettings,
  AISettings,
  AIProvider,
  JobMatch,
  StopListCheckResult,
  QueueStats,
  SubmitJobRequest,
  SubmitJobResponse,
  ScrapeConfig,
  CompanySubTask,
} from "@shared/types";

export { isQueueStatus, isQueueItemType } from "@shared/types";

/**
 * Additional BE-specific types can be added here
 */

// API Response wrapper types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  requestId?: string;
  timestamp?: string;
}

// Route handler types
export interface AuthenticatedRequest extends Express.Request {
  user?: {
    uid: string;
    email?: string;
    role?: string;
  };
  requestId?: string;
}

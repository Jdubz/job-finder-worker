# Firebase / Google Cloud Project Configuration
variable "firebase_project_id" {
  description = "Firebase project ID (same as GCP project ID)"
  type        = string
  default     = "static-sites-257923"
}

variable "gcp_region" {
  description = "Default GCP region for resources"
  type        = string
  default     = "us-central1"
}

# Firebase Hosting Configuration
variable "staging_site_id" {
  description = "Firebase Hosting site ID for staging environment"
  type        = string
  default     = "job-finder-staging"
}

variable "production_site_id" {
  description = "Firebase Hosting site ID for production environment"
  type        = string
  default     = "job-finder-production"
}

# Cloudflare Configuration
variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for DNS management"
  type        = string
  sensitive   = true
}

variable "firebase_hosting_ip" {
  description = "Firebase Hosting IP address for A records (proxied through Cloudflare)"
  type        = string
  default     = "199.36.158.100"
}

variable "cloudflare_staging_domain" {
  description = "Custom domain for staging environment"
  type        = string
  default     = "job-finder-staging.joshwentworth.com"
}

variable "cloudflare_production_domain" {
  description = "Custom domain for production environment"
  type        = string
  default     = "job-finder.joshwentworth.com"
}

# Service Account Configuration
variable "github_actions_service_account_email" {
  description = "Service account email for GitHub Actions deployments"
  type        = string
  default     = "firebase-adminsdk-xxxxx@static-sites-257923.iam.gserviceaccount.com"
}

# Environment-specific tags
variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
  default     = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    project     = "job-finder"
    managed_by  = "terraform"
    repository  = "job-finder-FE"
  }
}

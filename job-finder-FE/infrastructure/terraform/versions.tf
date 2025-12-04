terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Backend configuration for state management
  # Uncomment and configure for team collaboration
  # backend "gcs" {
  #   bucket = "job-finder-terraform-state"
  #   prefix = "frontend/hosting"
  # }
}

provider "google" {
  project = var.firebase_project_id
  region  = var.gcp_region
  # Credentials can be provided via:
  # - GOOGLE_APPLICATION_CREDENTIALS environment variable
  # - gcloud auth application-default login
}

provider "cloudflare" {
  # API token can be provided via:
  # - CLOUDFLARE_API_TOKEN environment variable
  # - api_token attribute (not recommended for security)
}

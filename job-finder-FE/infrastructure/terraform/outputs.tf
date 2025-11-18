# Firebase Hosting Outputs
output "staging_site_url" {
  description = "URL for staging Firebase Hosting site"
  value       = "https://${var.staging_site_id}.web.app"
}

output "production_site_url" {
  description = "URL for production Firebase Hosting site"
  value       = "https://${var.production_site_id}.web.app"
}

output "staging_custom_domain" {
  description = "Custom domain for staging (via Cloudflare)"
  value       = "https://${var.cloudflare_staging_domain}"
}

output "production_custom_domain" {
  description = "Custom domain for production (via Cloudflare)"
  value       = "https://${var.cloudflare_production_domain}"
}

# Cloudflare Outputs
output "cloudflare_staging_a_record_id" {
  description = "Cloudflare DNS A record ID for staging"
  value       = cloudflare_record.staging_a.id
}

output "cloudflare_staging_txt_record_id" {
  description = "Cloudflare DNS TXT record ID for staging"
  value       = cloudflare_record.staging_txt.id
}

output "cloudflare_production_a_record_id" {
  description = "Cloudflare DNS A record ID for production"
  value       = cloudflare_record.production_a.id
}

output "cloudflare_production_txt_record_id" {
  description = "Cloudflare DNS TXT record ID for production"
  value       = cloudflare_record.production_txt.id
}

# Service Account Outputs
output "github_actions_service_account" {
  description = "Service account email used for GitHub Actions deployments"
  value       = var.github_actions_service_account_email
}

# Secret Manager Outputs
output "staging_secret_name" {
  description = "Google Secret Manager secret name for staging config"
  value       = google_secret_manager_secret.firebase_config_staging.name
}

output "production_secret_name" {
  description = "Google Secret Manager secret name for production config"
  value       = google_secret_manager_secret.firebase_config_production.name
}

# Deployment Information
output "deployment_info" {
  description = "Summary of deployment configuration"
  value = {
    firebase_project = var.firebase_project_id
    staging = {
      site_id       = var.staging_site_id
      firebase_url  = "https://${var.staging_site_id}.web.app"
      custom_domain = "https://${var.cloudflare_staging_domain}"
    }
    production = {
      site_id       = var.production_site_id
      firebase_url  = "https://${var.production_site_id}.web.app"
      custom_domain = "https://${var.cloudflare_production_domain}"
    }
  }
}

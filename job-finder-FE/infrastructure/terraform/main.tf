# Firebase Hosting Sites
# Note: Firebase Hosting sites are typically created through the Firebase Console.
# Use data sources to reference existing sites and import them into Terraform state.

data "google_firebase_web_app" "staging" {
  project = var.firebase_project_id
  app_id  = var.staging_site_id
}

data "google_firebase_web_app" "production" {
  project = var.firebase_project_id
  app_id  = var.production_site_id
}

# IAM binding for GitHub Actions service account
# This grants the service account permission to deploy to Firebase Hosting
resource "google_project_iam_member" "firebase_hosting_admin" {
  project = var.firebase_project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${var.github_actions_service_account_email}"
}

resource "google_project_iam_member" "service_account_user" {
  project = var.firebase_project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${var.github_actions_service_account_email}"
}

# Cloudflare DNS Records
# These DNS records point custom domains to Firebase Hosting via Cloudflare proxy

# Staging A record (proxied through Cloudflare)
resource "cloudflare_record" "staging_a" {
  zone_id = var.cloudflare_zone_id
  name    = "job-finder-staging"
  type    = "A"
  content = var.firebase_hosting_ip
  # Auto (Cloudflare proxy enabled)
  ttl     = 1
  proxied = true

  comment = "Managed by Terraform - Points to Firebase Hosting via Cloudflare proxy"
}

# Staging TXT record for Firebase Hosting verification
resource "cloudflare_record" "staging_txt" {
  zone_id = var.cloudflare_zone_id
  name    = "job-finder-staging"
  type    = "TXT"
  content = "hosting-site=${var.staging_site_id}"
  ttl     = 1
  proxied = false

  comment = "Managed by Terraform - Firebase Hosting site verification"
}

# Production A record (proxied through Cloudflare)
resource "cloudflare_record" "production_a" {
  zone_id = var.cloudflare_zone_id
  name    = "job-finder"
  type    = "A"
  content = var.firebase_hosting_ip
  # Auto (Cloudflare proxy enabled)
  ttl     = 1
  proxied = true

  comment = "Managed by Terraform - Points to Firebase Hosting via Cloudflare proxy"
}

# Production TXT record for Firebase Hosting verification
resource "cloudflare_record" "production_txt" {
  zone_id = var.cloudflare_zone_id
  name    = "job-finder"
  type    = "TXT"
  content = "hosting-site=${var.production_site_id}"
  ttl     = 1
  proxied = false

  comment = "Managed by Terraform - Firebase Hosting site verification"
}

# Cloudflare Page Rules (optional - for advanced caching/security)
resource "cloudflare_page_rule" "staging_cache" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.cloudflare_staging_domain}/*"
  priority = 1

  actions {
    cache_level              = "cache_everything"
    edge_cache_ttl           = 3600
    browser_cache_ttl        = 3600
    security_level           = "medium"
    ssl                      = "flexible"
    automatic_https_rewrites = "on"
  }
}

resource "cloudflare_page_rule" "production_cache" {
  zone_id  = var.cloudflare_zone_id
  target   = "${var.cloudflare_production_domain}/*"
  priority = 1

  actions {
    cache_level              = "cache_everything"
    # 24 hours
    edge_cache_ttl           = 86400
    browser_cache_ttl        = 86400
    security_level           = "high"
    ssl                      = "strict"
    automatic_https_rewrites = "on"
  }
}

# Google Secret Manager for storing sensitive configuration
# This is where GitHub Actions can retrieve secrets at deployment time

resource "google_secret_manager_secret" "firebase_config_staging" {
  project   = var.firebase_project_id
  secret_id = "firebase-config-staging"

  replication {
    auto {}
  }

  labels = var.tags
}

resource "google_secret_manager_secret" "firebase_config_production" {
  project   = var.firebase_project_id
  secret_id = "firebase-config-production"

  replication {
    auto {}
  }

  labels = var.tags
}

# Grant GitHub Actions service account access to secrets
resource "google_secret_manager_secret_iam_member" "staging_secret_access" {
  project   = var.firebase_project_id
  secret_id = google_secret_manager_secret.firebase_config_staging.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.github_actions_service_account_email}"
}

resource "google_secret_manager_secret_iam_member" "production_secret_access" {
  project   = var.firebase_project_id
  secret_id = google_secret_manager_secret.firebase_config_production.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.github_actions_service_account_email}"
}

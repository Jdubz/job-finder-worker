#!/bin/bash
# Terraform Setup Script for Job Finder Frontend Infrastructure
# This script helps initialize and configure Terraform for managing Firebase Hosting and Cloudflare DNS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

# Header
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Terraform Setup - Job Finder Frontend Infrastructure    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if Terraform is installed
print_info "Checking for Terraform installation..."
if ! command -v terraform &> /dev/null; then
    print_error "Terraform is not installed!"
    echo ""
    echo "Please install Terraform using one of these methods:"
    echo ""
    echo "  Ubuntu/Debian:"
    echo "    sudo snap install terraform --classic"
    echo ""
    echo "  macOS:"
    echo "    brew tap hashicorp/tap"
    echo "    brew install hashicorp/tap/terraform"
    echo ""
    echo "  Or download from: https://www.terraform.io/downloads"
    echo ""
    exit 1
fi

TERRAFORM_VERSION=$(terraform version -json | jq -r '.terraform_version')
print_success "Terraform $TERRAFORM_VERSION installed"

# Check if terraform.tfvars exists
print_info "Checking for terraform.tfvars configuration..."
if [ ! -f "terraform.tfvars" ]; then
    print_warning "terraform.tfvars not found!"
    echo ""
    echo "Creating terraform.tfvars from example..."

    # Get Cloudflare credentials from 1Password if available
    if command -v op &> /dev/null; then
        print_info "Retrieving Cloudflare credentials from 1Password..."

        CLOUDFLARE_TOKEN=$(op item get "Job-finder-credentials" --fields cloudflare 2>/dev/null | grep "api key:" | cut -d: -f2- | xargs || echo "")
        ZONE_ID="a2a550d26ef7d26b3bcfe07b1e435909"

        if [ -n "$CLOUDFLARE_TOKEN" ] && [ -n "$ZONE_ID" ]; then
            print_success "Retrieved Cloudflare credentials from 1Password"

            cat > terraform.tfvars <<EOF
# Firebase / Google Cloud Project Configuration
firebase_project_id = "static-sites-257923"
gcp_region          = "us-central1"

# Firebase Hosting Site IDs
staging_site_id    = "job-finder-staging"
production_site_id = "job-finder-production"

# Firebase Hosting IP (Cloudflare proxied)
firebase_hosting_ip = "199.36.158.100"

# Cloudflare Configuration
cloudflare_zone_id = "$ZONE_ID"

# Custom Domain Configuration
cloudflare_staging_domain    = "job-finder-staging.joshwentworth.com"
cloudflare_production_domain = "job-finder.joshwentworth.com"

# GitHub Actions Service Account
github_actions_service_account_email = "firebase-admin@static-sites-257923.iam.gserviceaccount.com"

# Environment
environment = "staging"

# Resource Tags
tags = {
  project    = "job-finder"
  managed_by = "terraform"
  repository = "job-finder-FE"
  owner      = "jdubz"
}
EOF
            print_success "Created terraform.tfvars with credentials from 1Password"

            # Export Cloudflare token for Terraform
            export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"
            print_success "Exported CLOUDFLARE_API_TOKEN environment variable"
        else
            print_warning "Could not retrieve all credentials from 1Password"
            print_info "Copying terraform.tfvars.example to terraform.tfvars"
            cp terraform.tfvars.example terraform.tfvars
            print_warning "Please edit terraform.tfvars and add your Cloudflare Zone ID"
        fi
    else
        print_info "Copying terraform.tfvars.example to terraform.tfvars"
        cp terraform.tfvars.example terraform.tfvars
        print_warning "1Password CLI not found. Please edit terraform.tfvars manually"
    fi
else
    print_success "terraform.tfvars found"
fi

# Check for Google Cloud authentication
print_info "Checking Google Cloud authentication..."
if ! gcloud auth application-default print-access-token &> /dev/null; then
    print_warning "Google Cloud authentication not configured"
    echo ""
    echo "Please authenticate with Google Cloud:"
    echo "  gcloud auth application-default login"
    echo ""
    read -p "Press Enter after authenticating, or Ctrl+C to exit..."
fi

if gcloud auth application-default print-access-token &> /dev/null; then
    print_success "Google Cloud authentication configured"
else
    print_error "Google Cloud authentication failed"
    exit 1
fi

# Check for Cloudflare API token
print_info "Checking Cloudflare API token..."
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    print_warning "CLOUDFLARE_API_TOKEN not set"
    echo ""
    echo "Please set your Cloudflare API token:"
    echo "  export CLOUDFLARE_API_TOKEN=\"your-token-here\""
    echo ""
    echo "Or retrieve from 1Password:"
    echo "  eval \$(op signin)"
    echo "  export CLOUDFLARE_API_TOKEN=\$(op item get 'Job-finder-credentials' --fields cloudflare | grep 'api key:' | cut -d: -f2- | xargs)"
    echo ""
    read -p "Press Enter after setting the token, or Ctrl+C to exit..."
fi

if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    print_success "CLOUDFLARE_API_TOKEN is set"
else
    print_error "CLOUDFLARE_API_TOKEN is required"
    exit 1
fi

# Initialize Terraform
print_info "Initializing Terraform..."
if terraform init; then
    print_success "Terraform initialized successfully"
else
    print_error "Terraform initialization failed"
    exit 1
fi

# Format check
print_info "Checking Terraform formatting..."
if terraform fmt -check -recursive; then
    print_success "Terraform files are properly formatted"
else
    print_warning "Terraform files need formatting"
    print_info "Running terraform fmt..."
    terraform fmt -recursive
    print_success "Terraform files formatted"
fi

# Validate configuration
print_info "Validating Terraform configuration..."
if terraform validate; then
    print_success "Terraform configuration is valid"
else
    print_error "Terraform validation failed"
    exit 1
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   Setup Complete! ✅                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
print_success "Terraform is ready to use!"
echo ""
print_info "Next steps:"
echo ""
echo "  1. Review the configuration:"
echo "     terraform plan"
echo ""
echo "  2. Import existing DNS records:"
echo "     terraform import cloudflare_record.staging_a a2a550d26ef7d26b3bcfe07b1e435909/7ee1c5e5f81fd30ce0a4431f20add69a"
echo "     terraform import cloudflare_record.staging_txt a2a550d26ef7d26b3bcfe07b1e435909/3ea1eaad213a5c931803ce8cdbe3bb92"
echo "     terraform import cloudflare_record.production_a a2a550d26ef7d26b3bcfe07b1e435909/12f88e067d7734622fa0597a755ade53"
echo "     terraform import cloudflare_record.production_txt a2a550d26ef7d26b3bcfe07b1e435909/6e86c80f44088bd814801feba39c9a98"
echo ""
echo "  3. Apply changes (after review):"
echo "     terraform apply"
echo ""
print_info "For more details, see: docs/infrastructure/terraform-hosting.md"
echo ""

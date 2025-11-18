# Terraform Infrastructure for Job Finder Frontend

This directory contains Terraform configuration for managing Firebase Hosting and Cloudflare DNS infrastructure for the Job Finder frontend application.

## Overview

This Terraform configuration manages:

- **Firebase Hosting**: IAM permissions for GitHub Actions service account
- **Cloudflare DNS**: CNAME records pointing custom domains to Firebase Hosting
- **Google Secret Manager**: Secrets for environment configuration
- **IAM Bindings**: Service account permissions for deployment automation

## Prerequisites

### Required Tools

- [Terraform](https://www.terraform.io/downloads) >= 1.5.0
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (gcloud)
- [Cloudflare API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

### Required Credentials

1. **Google Cloud Authentication**:
   ```bash
   # Authenticate with Google Cloud
   gcloud auth application-default login

   # Set project
   gcloud config set project static-sites-257923
   ```

2. **Cloudflare API Token**:
   ```bash
   export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
   ```

3. **Terraform Variables**:
   ```bash
   # Copy example file and fill in your values
   cp terraform.tfvars.example terraform.tfvars

   # Edit terraform.tfvars with your actual values
   # IMPORTANT: Get cloudflare_zone_id from Cloudflare dashboard
   ```

## Quick Start

### 1. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

This downloads required provider plugins (Google and Cloudflare).

### 2. Format and Validate

```bash
# Format code to Terraform standards
terraform fmt

# Validate configuration
terraform validate
```

### 3. Plan Changes

```bash
# See what Terraform will create/change
terraform plan

# Save plan to file for review
terraform plan -out=tfplan
```

### 4. Apply Configuration

```bash
# Apply the plan (requires confirmation)
terraform apply

# Or apply saved plan (no confirmation needed)
terraform apply tfplan
```

## Importing Existing Resources

Since Firebase Hosting sites and Cloudflare records already exist, you need to import them into Terraform state.

### Import Cloudflare DNS Records

1. **Find existing record IDs**:
   ```bash
   # List all DNS records in your zone
   curl -X GET "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq '.result[] | select(.name | contains("job-finder"))'
   ```

2. **Import records**:
   ```bash
   # Import staging CNAME
   terraform import cloudflare_record.staging_cname YOUR_ZONE_ID/STAGING_RECORD_ID

   # Import production CNAME
   terraform import cloudflare_record.production_cname YOUR_ZONE_ID/PRODUCTION_RECORD_ID
   ```

### Import Firebase IAM Bindings

IAM bindings don't need explicit import - Terraform will create them if they don't exist or manage them if they do.

## Managing Multiple Environments

Use Terraform workspaces to manage staging and production separately:

```bash
# Create staging workspace
terraform workspace new staging
terraform workspace select staging

# Apply staging configuration
terraform apply -var="environment=staging"

# Create production workspace
terraform workspace new production
terraform workspace select production

# Apply production configuration
terraform apply -var="environment=production"
```

## State Management

### Local State (Default)

By default, Terraform stores state locally in `terraform.tfstate`. This is fine for individual development but not recommended for teams.

### Remote State (Recommended for Teams)

Configure Google Cloud Storage backend:

1. **Create GCS bucket** for state:
   ```bash
   gsutil mb -p static-sites-257923 -l us-central1 gs://job-finder-terraform-state
   gsutil versioning set on gs://job-finder-terraform-state
   ```

2. **Uncomment backend config** in `versions.tf`:
   ```hcl
   backend "gcs" {
     bucket = "job-finder-terraform-state"
     prefix = "frontend/hosting"
   }
   ```

3. **Reinitialize** Terraform:
   ```bash
   terraform init -migrate-state
   ```

## Common Operations

### View Current State

```bash
# List all resources in state
terraform state list

# Show details of specific resource
terraform state show cloudflare_record.staging_cname
```

### Update Single Resource

```bash
# Target specific resource for update
terraform apply -target=cloudflare_record.staging_cname
```

### Destroy Resources

```bash
# Destroy all resources (USE WITH CAUTION)
terraform destroy

# Destroy specific resource
terraform destroy -target=cloudflare_record.staging_cname
```

### Rollback Changes

```bash
# If something goes wrong, restore previous state
terraform state pull > backup.tfstate
terraform state push backup.tfstate
```

## Security Best Practices

### Credentials

- ✅ Use environment variables for API tokens
- ✅ Store terraform.tfvars in `.gitignore`
- ✅ Rotate Cloudflare API tokens every 90 days
- ✅ Use least-privilege permissions
- ❌ Never commit `.tfvars` files
- ❌ Never commit state files with sensitive data

### State Files

- ✅ Use remote state with encryption
- ✅ Enable versioning on state bucket
- ✅ Restrict access to state files
- ❌ Never commit state files to git

## Troubleshooting

### "Error: Invalid credentials"

**Solution**: Re-authenticate with Google Cloud:
```bash
gcloud auth application-default login
```

### "Error: Zone not found" (Cloudflare)

**Solution**: Verify Cloudflare API token has correct permissions:
- Zone:DNS:Edit
- Zone:Zone:Read

### "Error: Resource already exists"

**Solution**: Import the existing resource instead:
```bash
terraform import <resource_type>.<resource_name> <resource_id>
```

### "Error: Provider version mismatch"

**Solution**: Update provider lock file:
```bash
terraform init -upgrade
```

## Outputs

After applying, Terraform outputs key information:

```bash
# View all outputs
terraform output

# View specific output
terraform output staging_site_url
```

## CI/CD Integration

See `/.github/workflows/terraform-validate.yml` for Terraform validation in CI/CD pipeline.

The workflow:
- Runs `terraform fmt -check` to ensure code formatting
- Runs `terraform validate` to check configuration syntax
- Runs on all pull requests targeting `staging` or `main`

## Additional Resources

- [Terraform Google Provider Docs](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Terraform Cloudflare Provider Docs](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [Firebase Hosting Setup](../../DEPLOYMENT_RUNBOOK.md)
- [GitHub Secrets Setup](../../GITHUB_SECRETS_SETUP.md)

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Terraform plan output carefully
3. Consult `/docs/infrastructure/terraform-hosting.md`
4. Contact Worker A (infrastructure specialist)

---

**Last Updated**: 2025-10-20
**Terraform Version**: >= 1.5.0
**Provider Versions**: Google ~> 5.0, Cloudflare ~> 4.0

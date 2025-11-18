# Terraform Infrastructure as Code - Firebase Hosting & Cloudflare DNS

**Purpose**: Complete guide for managing Job Finder frontend infrastructure using Terraform
**Date**: 2025-10-20
**Status**: Production-ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Initial Setup](#initial-setup)
5. [Configuration](#configuration)
6. [Running Terraform](#running-terraform)
7. [Importing Existing Resources](#importing-existing-resources)
8. [State Management](#state-management)
9. [CI/CD Integration](#cicd-integration)
10. [Managing Secrets](#managing-secrets)
11. [Rollback Procedures](#rollback-procedures)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)

---

## Overview

This Terraform configuration provides Infrastructure as Code (IaC) for:

- **Firebase Hosting**: IAM permissions for GitHub Actions service account
- **Cloudflare DNS**: CNAME records for custom domains
- **Google Secret Manager**: Secure storage for configuration secrets
- **Service Account Permissions**: Automated deployment access control

### Why Terraform?

- **Reproducibility**: Rebuild infrastructure from code
- **Version Control**: Track infrastructure changes in git
- **Documentation**: Code serves as living documentation
- **Safety**: Plan before apply, prevent accidental changes
- **Collaboration**: Team members can review infrastructure changes

---

## Architecture

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions                            │
│  (uses FIREBASE_SERVICE_ACCOUNT secret)                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Deploys via Firebase CLI
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Hosting                                │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ job-finder-staging  │  │ job-finder-production│          │
│  │ (staging target)    │  │ (production target)   │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                               │
│  • Firebase Project: static-sites-257923                     │
│  • Public URLs: *.web.app                                    │
└─────────────────────────────────────────────────────────────┘
                  │
                  │ DNS managed by
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare DNS                              │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Staging CNAME       │  │ Production CNAME     │          │
│  │ job-finder-staging  │  │ job-finder           │          │
│  │ .joshwentworth.com  │  │ .joshwentworth.com   │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                               │
│  • Points to: *.web.app                                      │
│  • Cloudflare Proxy: Enabled (security, caching)            │
└─────────────────────────────────────────────────────────────┘
```

### Terraform Resource Graph

```
google_project_iam_member (Firebase Hosting Admin)
    ↓
google_project_iam_member (Service Account User)
    ↓
cloudflare_record (staging CNAME)
    ↓
cloudflare_record (production CNAME)
    ↓
cloudflare_page_rule (caching/security)
    ↓
google_secret_manager_secret (config storage)
    ↓
google_secret_manager_secret_iam_member (access control)
```

---

## Prerequisites

### Required Tools

Install these tools before proceeding:

1. **Terraform >= 1.5.0**
   ```bash
   # macOS
   brew tap hashicorp/tap
   brew install hashicorp/tap/terraform

   # Linux
   wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
   unzip terraform_1.5.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/

   # Verify
   terraform version
   ```

2. **Google Cloud SDK**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Linux
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL

   # Verify
   gcloud version
   ```

3. **jq** (for JSON parsing)
   ```bash
   # macOS
   brew install jq

   # Linux
   sudo apt-get install jq

   # Verify
   jq --version
   ```

### Required Access

- **Google Cloud Project**: `static-sites-257923`
  - Role: Project Editor or Owner
  - Permission to create IAM bindings

- **Cloudflare Account**: Access to DNS zone
  - Permission to manage DNS records
  - Permission to create API tokens

- **GitHub Repository**: `job-finder-FE`
  - Admin access to manage secrets

---

## Initial Setup

### Step 1: Authenticate with Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Set default project
gcloud config set project static-sites-257923

# Create application default credentials for Terraform
gcloud auth application-default login
```

### Step 2: Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use **"Edit zone DNS"** template
4. Configure permissions:
   - **Zone Resources**: Include → Specific zone → Select your zone
   - **Permissions**:
     - Zone → DNS → Edit
     - Zone → Zone → Read
5. Click **"Continue to summary"** → **"Create Token"**
6. **Copy the token** (you won't see it again)
7. Store securely:
   ```bash
   export CLOUDFLARE_API_TOKEN="your-token-here"

   # Add to your shell profile for persistence
   echo 'export CLOUDFLARE_API_TOKEN="your-token-here"' >> ~/.bashrc
   # or ~/.zshrc if using zsh
   ```

### Step 3: Get Cloudflare Zone ID

```bash
# Option 1: From Cloudflare Dashboard
# Go to: https://dash.cloudflare.com
# Select your domain → Overview
# Scroll down → Find "Zone ID" in API section

# Option 2: Via API
curl -X GET "https://api.cloudflare.com/client/v4/zones" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[] | select(.name == "joshwentworth.com") | .id'
```

### Step 4: Configure Terraform Variables

```bash
# Navigate to terraform directory
cd infrastructure/terraform

# Copy example variables file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars  # or nano, code, etc.
```

**Required variables** in `terraform.tfvars`:

```hcl
# REQUIRED: Update this value
cloudflare_zone_id = "your-cloudflare-zone-id-here"

# Optional: Update if service account email differs
github_actions_service_account_email = "firebase-adminsdk-xxxxx@static-sites-257923.iam.gserviceaccount.com"

# Other values can remain as defaults unless customization needed
```

### Step 5: Initialize Terraform

```bash
# Initialize Terraform (downloads providers)
terraform init

# Expected output:
# Terraform has been successfully initialized!
```

---

## Configuration

### Environment Variables

Set these environment variables before running Terraform:

```bash
# Google Cloud authentication (set by gcloud auth application-default login)
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json"

# Cloudflare authentication
export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"

# Verify
echo $GOOGLE_APPLICATION_CREDENTIALS
echo $CLOUDFLARE_API_TOKEN
```

### Terraform Variables

Variables are defined in `variables.tf` and values set in `terraform.tfvars`:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `firebase_project_id` | Firebase/GCP project ID | `static-sites-257923` | Yes |
| `gcp_region` | Default GCP region | `us-central1` | No |
| `staging_site_id` | Firebase staging site ID | `job-finder-staging` | Yes |
| `production_site_id` | Firebase production site ID | `job-finder-production` | Yes |
| `cloudflare_zone_id` | Cloudflare zone ID | - | **Yes** |
| `cloudflare_staging_domain` | Staging custom domain | `job-finder-staging.joshwentworth.com` | No |
| `cloudflare_production_domain` | Production custom domain | `job-finder.joshwentworth.com` | No |
| `github_actions_service_account_email` | Service account for CI/CD | - | Yes |

---

## Running Terraform

### Standard Workflow

```bash
# 1. Format code
terraform fmt

# 2. Validate syntax
terraform validate

# 3. Plan changes
terraform plan

# 4. Review plan output carefully
# - Green (+): Resources to be created
# - Yellow (~): Resources to be modified
# - Red (-): Resources to be destroyed

# 5. Apply changes (requires confirmation)
terraform apply

# Or apply without confirmation (use with caution)
terraform apply -auto-approve
```

### Workspace-Based Environment Management

Use Terraform workspaces to manage staging and production separately:

```bash
# Create and select staging workspace
terraform workspace new staging
terraform workspace select staging

# Apply staging configuration
terraform apply -var="environment=staging"

# Switch to production workspace
terraform workspace new production
terraform workspace select production

# Apply production configuration
terraform apply -var="environment=production"

# List all workspaces
terraform workspace list

# Show current workspace
terraform workspace show
```

### Targeted Operations

Apply changes to specific resources only:

```bash
# Update only staging DNS record
terraform apply -target=cloudflare_record.staging_cname

# Update IAM permissions only
terraform apply -target=google_project_iam_member.firebase_hosting_admin

# Plan for specific resource
terraform plan -target=cloudflare_record.production_cname
```

---

## Importing Existing Resources

Since Firebase Hosting sites and Cloudflare DNS records already exist, import them into Terraform state.

### Import Cloudflare DNS Records

1. **List existing DNS records**:
   ```bash
   # Store zone ID
   ZONE_ID="your-cloudflare-zone-id"

   # List all DNS records
   curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq '.result[] | select(.name | contains("job-finder"))'
   ```

2. **Identify record IDs**:
   ```bash
   # Staging record
   STAGING_RECORD_ID=$(curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq -r '.result[] | select(.name == "job-finder-staging.joshwentworth.com") | .id')

   # Production record
   PRODUCTION_RECORD_ID=$(curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq -r '.result[] | select(.name == "job-finder.joshwentworth.com") | .id')

   echo "Staging: $STAGING_RECORD_ID"
   echo "Production: $PRODUCTION_RECORD_ID"
   ```

3. **Import into Terraform**:
   ```bash
   # Import staging CNAME
   terraform import cloudflare_record.staging_cname $ZONE_ID/$STAGING_RECORD_ID

   # Import production CNAME
   terraform import cloudflare_record.production_cname $ZONE_ID/$PRODUCTION_RECORD_ID

   # Verify import
   terraform state list
   ```

4. **Import Cloudflare Page Rules** (if they exist):
   ```bash
   # List page rules
   curl -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/pagerules" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq '.result[]'

   # Import page rules
   terraform import cloudflare_page_rule.staging_cache $ZONE_ID/PAGE_RULE_ID
   terraform import cloudflare_page_rule.production_cache $ZONE_ID/PAGE_RULE_ID
   ```

### Verify Import Success

```bash
# Check state
terraform state list

# Expected output:
# cloudflare_record.staging_cname
# cloudflare_record.production_cname
# google_project_iam_member.firebase_hosting_admin
# google_project_iam_member.service_account_user
# ...

# Verify no changes needed
terraform plan

# Expected output:
# No changes. Your infrastructure matches the configuration.
```

---

## State Management

### Local State (Default)

By default, Terraform stores state in `terraform.tfstate` file locally.

**Pros**:
- Simple setup
- Good for solo development

**Cons**:
- Not safe for teams
- Risk of losing state file
- No concurrent access protection

### Remote State (Recommended for Teams)

Use Google Cloud Storage for shared, versioned state.

#### Setup Remote Backend

1. **Create GCS bucket**:
   ```bash
   # Create bucket
   gsutil mb -p static-sites-257923 -l us-central1 gs://job-finder-terraform-state

   # Enable versioning
   gsutil versioning set on gs://job-finder-terraform-state

   # Set lifecycle (optional - keep last 10 versions)
   cat > lifecycle.json << 'EOF'
   {
     "lifecycle": {
       "rule": [
         {
           "action": {"type": "Delete"},
           "condition": {"numNewerVersions": 10}
         }
       ]
     }
   }
   EOF
   gsutil lifecycle set lifecycle.json gs://job-finder-terraform-state
   ```

2. **Update `versions.tf`**:
   ```hcl
   terraform {
     required_version = ">= 1.5.0"

     backend "gcs" {
       bucket = "job-finder-terraform-state"
       prefix = "frontend/hosting"
     }

     # ... rest of configuration
   }
   ```

3. **Migrate state**:
   ```bash
   # Reinitialize with new backend
   terraform init -migrate-state

   # Confirm migration when prompted
   # Type: yes
   ```

4. **Verify**:
   ```bash
   # Check state is in GCS
   gsutil ls gs://job-finder-terraform-state/frontend/hosting/

   # Expected: default.tfstate
   ```

### State Operations

```bash
# View current state
terraform state list

# Show specific resource
terraform state show cloudflare_record.staging_cname

# Pull state to local file
terraform state pull > terraform.tfstate.backup

# Push state from file (use with extreme caution)
terraform state push terraform.tfstate.backup

# Remove resource from state (doesn't delete resource)
terraform state rm cloudflare_record.staging_cname

# Move resource in state (rename)
terraform state mv cloudflare_record.old_name cloudflare_record.new_name
```

---

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/terraform-validate.yml`:

```yaml
name: Terraform Validation

on:
  pull_request:
    branches: [staging, main]
    paths:
      - 'infrastructure/terraform/**'
  push:
    branches: [staging, main]
    paths:
      - 'infrastructure/terraform/**'

env:
  TF_VERSION: '1.5.0'

jobs:
  validate:
    name: Terraform Validate
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: infrastructure/terraform

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Format Check
        run: terraform fmt -check -recursive

      - name: Terraform Init
        run: terraform init -backend=false

      - name: Terraform Validate
        run: terraform validate

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ Terraform validation passed!'
            })
```

### Workflow Triggers

- **Pull Requests**: Validates Terraform on PRs to `staging` or `main`
- **Push**: Validates after merge to `staging` or `main`
- **Manual**: Can be triggered manually via GitHub UI

### CI/CD Best Practices

1. **Never run `terraform apply` in CI/CD automatically**
   - Plan in CI/CD ✅
   - Apply manually ✅
   - Auto-apply ❌

2. **Use `terraform plan -out=tfplan`** to save plans:
   ```yaml
   - name: Terraform Plan
     run: terraform plan -out=tfplan

   - name: Upload Plan
     uses: actions/upload-artifact@v4
     with:
       name: tfplan
       path: infrastructure/terraform/tfplan
   ```

3. **Require approvals for production** changes

---

## Managing Secrets

### Google Secret Manager

Terraform creates Secret Manager secrets for storing configuration:

```bash
# List secrets
gcloud secrets list --project=static-sites-257923

# Create secret version
echo -n '{"apiKey": "value"}' | gcloud secrets versions add firebase-config-staging --data-file=-

# Access secret
gcloud secrets versions access latest --secret=firebase-config-staging

# Grant access to service account
gcloud secrets add-iam-policy-binding firebase-config-staging \
  --member="serviceAccount:firebase-adminsdk-xxxxx@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### GitHub Secrets

Firebase service account remains in GitHub Secrets:

```bash
# Using GitHub CLI
gh secret set FIREBASE_SERVICE_ACCOUNT < service-account-key.json

# Verify
gh secret list
```

### Secret Rotation

**Schedule**: Every 90 days

**Process**:
1. Create new service account key in Firebase Console
2. Test new key locally
3. Update GitHub secret
4. Verify deployment works
5. Revoke old key

---

## Rollback Procedures

### Scenario 1: Bad Terraform Apply

If `terraform apply` causes issues:

```bash
# 1. Review what changed
terraform show

# 2. Restore from state backup
terraform state pull > current.tfstate
terraform state push previous.tfstate

# 3. Or use GCS versioned state
gsutil cp gs://job-finder-terraform-state/frontend/hosting/default.tfstate.1234567890 .
terraform state push default.tfstate.1234567890
```

### Scenario 2: DNS Issues

If DNS changes cause problems:

```bash
# 1. Check current DNS
dig job-finder.joshwentworth.com

# 2. Rollback specific resource
terraform state pull > backup.tfstate
terraform import cloudflare_record.production_cname $ZONE_ID/$OLD_RECORD_ID

# 3. Or manually fix in Cloudflare dashboard
# Then import corrected state
```

### Scenario 3: Permission Issues

If IAM changes break deployments:

```bash
# 1. Manually restore permissions in Google Cloud Console
# IAM & Admin → Select service account → Grant roles

# 2. Import corrected state
terraform import google_project_iam_member.firebase_hosting_admin \
  "static-sites-257923 roles/firebasehosting.admin serviceAccount:firebase-adminsdk-xxxxx@static-sites-257923.iam.gserviceaccount.com"
```

### General Rollback Strategy

1. **Identify the issue**: What broke?
2. **Check state history**: `gsutil ls -l gs://job-finder-terraform-state/frontend/hosting/`
3. **Restore known-good state**: `terraform state push good.tfstate`
4. **Verify**: `terraform plan` should show no unexpected changes
5. **Test**: Verify application functionality

---

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

**Error**: `Error: google: could not find default credentials`

**Solution**:
```bash
gcloud auth application-default login
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json"
```

#### 2. Cloudflare API Errors

**Error**: `Error: failed to create DNS record: Invalid request headers (6003)`

**Solution**:
```bash
# Verify token is set
echo $CLOUDFLARE_API_TOKEN

# Verify token has correct permissions
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

#### 3. State Lock Errors

**Error**: `Error: Error acquiring the state lock`

**Solution**:
```bash
# Force unlock (use with caution)
terraform force-unlock LOCK_ID

# Or wait for lock to expire (usually 15 minutes)
```

#### 4. Import Conflicts

**Error**: `Error: resource already managed by Terraform`

**Solution**:
```bash
# Remove from state and re-import
terraform state rm cloudflare_record.staging_cname
terraform import cloudflare_record.staging_cname $ZONE_ID/$RECORD_ID
```

#### 5. Provider Version Mismatch

**Error**: `Error: Incompatible provider version`

**Solution**:
```bash
# Update provider versions
terraform init -upgrade

# Or delete lock file and reinitialize
rm .terraform.lock.hcl
terraform init
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug level
export TF_LOG=DEBUG
export TF_LOG_PATH=terraform.log

# Run terraform
terraform plan

# Check log
cat terraform.log
```

---

## Best Practices

### Code Organization

✅ **Do**:
- Keep Terraform files in `infrastructure/terraform/`
- Use descriptive resource names
- Comment complex logic
- Use variables for all environment-specific values
- Version control all `.tf` files

❌ **Don't**:
- Hardcode values in resources
- Commit `.tfvars` files with secrets
- Mix staging and production in same workspace
- Skip `terraform plan` before apply

### Security

✅ **Do**:
- Use remote state with encryption
- Rotate credentials every 90 days
- Use least-privilege permissions
- Enable state versioning
- Review plans carefully before applying

❌ **Don't**:
- Commit state files
- Share API tokens via chat/email
- Grant excessive permissions
- Auto-apply without review
- Store secrets in Terraform files

### Collaboration

✅ **Do**:
- Use remote state for teams
- Document all changes
- Use workspaces for environments
- Review Terraform changes in PRs
- Communicate infrastructure changes

❌ **Don't**:
- Work on same resources simultaneously
- Make production changes without approval
- Skip documentation updates
- Apply changes without team notification

### Maintenance

✅ **Do**:
- Keep Terraform version updated
- Review provider updates
- Clean up unused resources
- Monitor state file size
- Maintain changelog of infrastructure changes

❌ **Don't**:
- Let provider versions drift too far
- Accumulate unused resources
- Ignore Terraform warnings
- Skip regular audits

---

## Additional Resources

### Official Documentation

- [Terraform Documentation](https://www.terraform.io/docs)
- [Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Cloudflare Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)

### Internal Documentation

- [DEPLOYMENT_RUNBOOK.md](../../DEPLOYMENT_RUNBOOK.md) - Deployment procedures
- [GITHUB_SECRETS_SETUP.md](../../GITHUB_SECRETS_SETUP.md) - Secret management
- [README.md](../../README.md) - Project overview

### External Resources

- [Terraform Best Practices](https://www.terraform-best-practices.com/)
- [Google Cloud IAM Best Practices](https://cloud.google.com/iam/docs/best-practices)
- [Cloudflare DNS Best Practices](https://developers.cloudflare.com/dns/best-practices/)

---

## Support

For questions or issues:

1. Check [Troubleshooting](#troubleshooting) section
2. Review `terraform plan` output carefully
3. Check Terraform logs (`terraform.log`)
4. Consult official provider documentation
5. Contact Worker A (infrastructure specialist)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-20
**Next Review**: 2025-11-20
**Owner**: Worker A
**Status**: Production

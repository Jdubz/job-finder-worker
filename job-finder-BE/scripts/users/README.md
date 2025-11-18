# User Role Management Scripts

Scripts for managing user roles across all environments.

## ⚠️ IMPORTANT: Custom Claims vs Firestore Documents

There are TWO different systems for roles:

1. **Firebase Auth Custom Claims** (JWT token) - Used by Cloud Functions middleware and Firestore rules
2. **Firestore User Documents** - Used for UI display only

**For authentication to work**, you MUST set custom claims on the Firebase Auth token.

## Available Scripts

### ✅ Set Custom Claims (RECOMMENDED)

Sets Firebase Auth custom claims on the user's authentication token. This is what Cloud Functions and Firestore rules check.

```bash
# Local emulator
npm run script:set-claims -- <user-id> <role> local

# Staging
npm run script:set-claims -- <user-id> <role> staging

# Production
npm run script:set-claims -- <user-id> <role> production
```

**Roles**: `viewer`, `editor`, `admin`

**Example**:
```bash
npm run script:set-claims -- abc123 editor local
```

**⚠️ After running**: User MUST sign out and sign back in for claims to take effect!

### ⚠️ Add Editor Role (DEPRECATED)

Adds the `{ "role": "editor" }` field to a Firestore user document.

**WARNING**: This does NOT set Firebase Auth custom claims! Use `script:set-claims` instead.

```bash
# Local emulator
npm run script:add-editor -- <user-id> local

# Staging
npm run script:add-editor -- <user-id> staging

# Production
npm run script:add-editor -- <user-id> production
```

### Remove Editor Role

Removes the `role` field from a user document.

```bash
# Local emulator
npm run script:remove-editor -- <user-id> local

# Staging
npm run script:remove-editor -- <user-id> staging

# Production
npm run script:remove-editor -- <user-id> production
```

## Examples

```bash
# Add editor role to user in local emulator
npm run script:add-editor -- abc123 local

# Add editor role to user in staging
npm run script:add-editor -- abc123 staging

# Remove editor role from user in production
npm run script:remove-editor -- abc123 production
```

## Environments

- **local** - Firebase emulator (localhost:8080)
  - Project: demo-project
  - Database: portfolio
  - No confirmation required

- **staging** - Staging environment
  - Project: static-sites-257923
  - Database: portfolio-staging
  - Requires confirmation

- **production** - Production environment
  - Project: static-sites-257923
  - Database: portfolio
  - Requires confirmation with extra warning

## Safety Features

1. **User Existence Check** - Verifies user exists before modifying
2. **Current Data Display** - Shows user data before modification
3. **Confirmation Prompts** - Required for staging and production
4. **Updated Data Verification** - Shows updated data after modification
5. **Production Warning** - Extra warning for production changes

## Script Output

```bash
$ npm run script:add-editor -- abc123 staging

📍 Connected to Firebase project: static-sites-257923

🔍 Checking user...
   User ID: abc123
   Environment: staging
   Project: static-sites-257923
   Database: portfolio-staging

📄 Current user data:
{
  "email": "user@example.com",
  "name": "Test User",
  "createdAt": "2025-01-15T10:30:00Z"
}

Continue? (yes/no): yes

✏️  Adding editor role...
✅ Editor role added successfully!

📄 Updated user data:
{
  "email": "user@example.com",
  "name": "Test User",
  "role": "editor",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-21T18:30:00Z"
}
```

## Using with Dev-Monitor

These scripts are available in the dev-monitor UI under the **Scripts** tab:

### Local Environment (Safe)
- **Add Editor Role (Local)** - No confirmation required
- **Remove Editor Role (Local)** - No confirmation required

### Staging Environment (Warning)
- **Add Editor Role (Staging)** - Requires confirmation
- **Remove Editor Role (Staging)** - Requires confirmation

### Production Environment (Danger)
- **Add Editor Role (Production)** - Requires confirmation + warning
- **Remove Editor Role (Production)** - Requires confirmation + warning

**Note:** When using dev-monitor, you'll need to replace `USER_ID` in the command with the actual user ID before executing.

## Error Handling

The scripts will exit with an error in these cases:

1. **User not found**
   ```
   ❌ Error: User abc123 not found
   ```

2. **Invalid environment**
   ```
   ❌ Error: Invalid environment "prod"
   Valid environments: local, staging, production
   ```

3. **Missing arguments**
   ```
   Usage: npm run script:add-editor -- <user-id> <environment>
   ```

4. **User cancels confirmation**
   ```
   ❌ Aborted
   ```

## Technical Details

- **Language**: TypeScript (ts-node)
- **Dependencies**: firebase-admin
- **Firestore Collection**: `users`
- **Fields Modified**:
  - `role` - Set to "editor" or deleted
  - `updatedAt` - Updated with server timestamp

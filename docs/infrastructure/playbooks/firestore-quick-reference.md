# Firestore Quick Reference

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Quick Status Check

```bash
# Run full verification
cd job-finder-FE && ./verify-firestore-fixes.sh

# Check deployed databases
firebase firestore:databases:list --project static-sites-257923
```

## Monitoring Checklist

### Browser Console

- [ ] No "INTERNAL ASSERTION FAILED" errors
- [ ] No "400 Bad Request" on Listen channel
- [ ] Permission errors show warnings only (not crashes)

### User Experience

- [ ] Job Matches page loads
- [ ] Settings page loads
- [ ] Navigation works smoothly
- [ ] No white screen errors

## Key Files

```
job-finder-FE/src/services/firestore/FirestoreService.ts
  - Added error recovery guards
  - Graceful permission error handling

job-finder-BE/firestore.rules
  - Deployed to portfolio-staging
  - Deployed to portfolio

job-finder-BE/firestore.indexes.json
  - Deployed to both databases
```

## Troubleshooting

### INTERNAL ASSERTION

```bash
# Check error handling is active
grep "hasError" job-finder-FE/src/services/firestore/FirestoreService.ts
```

### Permission Denied

```bash
# Check Firestore rules deployed
firebase firestore:databases:list --project static-sites-257923
```

### Database Routing

```bash
# Check environment variables
grep "VITE_FIRESTORE_DATABASE_ID" job-finder-FE/.env.staging
grep "VITE_FIRESTORE_DATABASE_ID" job-finder-FE/.env.production
```

#!/bin/bash
#
# Sync content-items from portfolio database using Firebase REST API
#

set -e

PROJECT_ID="static-sites-257923"
DATABASE_ID="portfolio"
COLLECTION="content-items"
EMULATOR_HOST="localhost:8080"

echo "📥 Syncing $COLLECTION from $DATABASE_ID database..."
echo ""

# Get access token
ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Could not get access token"
  echo "   Run: gcloud auth login"
  exit 1
fi

echo "✅ Authenticated with gcloud"
echo ""

# Fetch from production via REST API
echo "📡 Fetching from production..."
PROD_URL="https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/$DATABASE_ID/documents/$COLLECTION"

curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$PROD_URL" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
docs = data.get('documents', [])
print(f'Found {len(docs)} documents in production')

# Save to file for import
with open('/tmp/content-items-export.json', 'w') as f:
    json.dump(docs, f, indent=2)
    
print(f'Saved to /tmp/content-items-export.json')
"

echo ""
echo "Now importing to local emulator..."

# Import to emulator using admin SDK
node -e "
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({ projectId: '$PROJECT_ID' });
const db = admin.firestore();

const docs = JSON.parse(fs.readFileSync('/tmp/content-items-export.json', 'utf8'));

(async () => {
  console.log('Importing', docs.length, 'documents...');
  
  for (const doc of docs) {
    const docId = doc.name.split('/').pop();
    const data = {};
    
    // Convert Firestore REST format to object
    for (const [key, value] of Object.entries(doc.fields || {})) {
      if (value.stringValue) data[key] = value.stringValue;
      else if (value.integerValue) data[key] = parseInt(value.integerValue);
      else if (value.booleanValue !== undefined) data[key] = value.booleanValue;
      else if (value.timestampValue) data[key] = new Date(value.timestampValue);
      else if (value.arrayValue) {
        data[key] = (value.arrayValue.values || []).map(v => v.stringValue || v);
      }
      else if (value.mapValue) {
        data[key] = {};
        for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
          data[key][k] = v.stringValue || v.integerValue || v;
        }
      }
      else data[key] = value;
    }
    
    await db.collection('$COLLECTION').doc(docId).set(data);
    console.log('   ✅', docId);
  }
  
  console.log('');
  console.log('✅ Synced', docs.length, 'documents');
  process.exit(0);
})().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
"


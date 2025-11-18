#!/usr/bin/env node

/**
 * Clear only the content-items collection from local Firestore emulator
 * This is safer than clearing all data
 */

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  getDocs, 
  deleteDoc, 
  doc,
  connectFirestoreEmulator 
} = require('firebase/firestore');

// Firebase config for local emulator
const firebaseConfig = {
  projectId: 'demo-project', // Local emulator project ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Connect to local emulator
connectFirestoreEmulator(db, 'localhost', 8080);

async function clearContentItems() {
  try {
    console.log('🔍 Checking content-items collection...');
    
    // Get all documents in content-items collection
    const contentItemsRef = collection(db, 'content-items');
    const snapshot = await getDocs(contentItemsRef);
    
    console.log(`📊 Found ${snapshot.size} documents in content-items collection`);
    
    if (snapshot.size === 0) {
      console.log('✅ No documents to delete');
      return;
    }
    
    // List the documents
    console.log('\n📋 Documents to delete:');
    snapshot.forEach((doc) => {
      console.log(`  - ${doc.id} (${doc.data().type || 'unknown type'})`);
    });
    
    // Delete all documents
    console.log('\n🗑️  Deleting documents...');
    const deletePromises = [];
    snapshot.forEach((docSnapshot) => {
      deletePromises.push(deleteDoc(docSnapshot.ref));
    });
    
    await Promise.all(deletePromises);
    
    console.log('✅ Successfully cleared content-items collection');
    console.log(`   Deleted ${snapshot.size} documents`);
    
  } catch (error) {
    console.error('❌ Error clearing content-items collection:', error);
    process.exit(1);
  }
}

// Run the function
clearContentItems().then(() => {
  console.log('\n🎉 Content-items collection cleared successfully!');
  console.log('   You can now import the clean JSON file.');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Failed to clear content-items collection:', error);
  process.exit(1);
});

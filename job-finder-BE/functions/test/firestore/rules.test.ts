/**
 * Firestore Security Rules Tests
 *
 * Tests the security rules defined in firestore.rules
 * using the Firebase Emulator Suite.
 *
 * Run with: npm run test:firestore-rules
 */

import * as firebase from "@firebase/rules-unit-testing"
import { Timestamp } from "@google-cloud/firestore"
import * as fs from "fs"
import * as path from "path"

// Test users with different roles
const VIEWER_USER = {
  uid: "viewer-user-123",
  email: "viewer@example.com",
  role: "viewer",
}

const EDITOR_USER = {
  uid: "editor-user-456",
  email: "editor@example.com",
  role: "editor",
}

const ADMIN_USER = {
  uid: "admin-user-789",
  email: "admin@example.com",
  role: "admin",
}

const OTHER_USER = {
  uid: "other-user-999",
  email: "other@example.com",
  role: "viewer",
}

describe("Firestore Security Rules", () => {
  let testEnv: firebase.RulesTestEnvironment

  beforeAll(async () => {
    // Load Firestore rules (from parent directory)
    const rulesPath = path.join(process.cwd(), "..", "firestore.rules")
    const rules = fs.readFileSync(rulesPath, "utf8")

    // Create test environment
    testEnv = await firebase.initializeTestEnvironment({
      projectId: "demo-test-project",
      firestore: {
        rules,
        host: "localhost",
        port: 8080,
      },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  // ============================================================
  // JOB QUEUE COLLECTION TESTS
  // ============================================================

  describe("job-queue collection", () => {
    const queueItemId = "queue-item-123"

    beforeEach(async () => {
      // Seed test data
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("job-queue")
          .doc(queueItemId)
          .set({
            submitted_by: VIEWER_USER.uid,
            url: "https://example.com/job",
            status: "pending",
            created_at: Timestamp.now(),
          })
      })
    })

    it("allows users to read their own queue items", async () => {
      const db = testEnv.authenticatedContext(VIEWER_USER.uid, { email: VIEWER_USER.email, role: VIEWER_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("job-queue").doc(queueItemId).get())
    })

    it("denies users from reading other users' queue items", async () => {
      const db = testEnv.authenticatedContext(OTHER_USER.uid, { email: OTHER_USER.email, role: OTHER_USER.role }).firestore()
      await firebase.assertFails(db.collection("job-queue").doc(queueItemId).get())
    })

    it("allows authenticated users to create queue items", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("job-queue").add({
          submitted_by: EDITOR_USER.uid,
          url: "https://example.com/new-job",
          status: "pending",
          created_at: Timestamp.now(),
        })
      )
    })

    it("denies creating queue items for other users", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertFails(
        db.collection("job-queue").add({
          submitted_by: VIEWER_USER.uid,
          url: "https://example.com/new-job",
          status: "pending",
          created_at: Timestamp.now(),
        })
      )
    })

    it("allows admins to read all queue items", async () => {
      const db = testEnv.authenticatedContext(ADMIN_USER.uid, { email: ADMIN_USER.email, role: ADMIN_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("job-queue").doc(queueItemId).get())
    })

    it("allows admins to delete any queue item", async () => {
      const db = testEnv.authenticatedContext(ADMIN_USER.uid, { email: ADMIN_USER.email, role: ADMIN_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("job-queue").doc(queueItemId).delete())
    })
  })

  // ============================================================
  // GENERATOR DOCUMENTS COLLECTION TESTS
  // ============================================================

  describe("generator-documents collection", () => {
    const documentId = "gen-doc-123"

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("generator-documents")
          .doc(documentId)
          .set({
            type: "request",
            access: {
              userId: EDITOR_USER.uid,
            },
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          })
      })
    })

    it("allows users to read their own documents", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("generator-documents").doc(documentId).get())
    })

    it("denies users from reading other users' documents", async () => {
      const db = testEnv.authenticatedContext(OTHER_USER.uid, { email: OTHER_USER.email, role: OTHER_USER.role }).firestore()
      await firebase.assertFails(db.collection("generator-documents").doc(documentId).get())
    })

    it("allows editors to create documents", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("generator-documents").add({
          type: "request",
          access: {
            userId: EDITOR_USER.uid,
          },
          createdAt: Timestamp.now(),
        })
      )
    })

    it("denies viewers from creating documents", async () => {
      const db = testEnv.authenticatedContext(VIEWER_USER.uid, { email: VIEWER_USER.email, role: VIEWER_USER.role }).firestore()
      await firebase.assertFails(
        db.collection("generator-documents").add({
          type: "request",
          access: {
            userId: VIEWER_USER.uid,
          },
          createdAt: Timestamp.now(),
        })
      )
    })

    it("allows editors to update their own documents", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("generator-documents").doc(documentId).update({
          status: "processing",
        })
      )
    })

    it("allows admins to access any document", async () => {
      const db = testEnv.authenticatedContext(ADMIN_USER.uid, { email: ADMIN_USER.email, role: ADMIN_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("generator-documents").doc(documentId).get())
      await firebase.assertSucceeds(db.collection("generator-documents").doc(documentId).delete())
    })
  })

  // ============================================================
  // CONTENT ITEMS COLLECTION TESTS
  // ============================================================

  describe("content-items collection", () => {
    const itemId = "content-item-123"

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("content-items")
          .doc(itemId)
          .set({
            userId: EDITOR_USER.uid,
            type: "experience",
            title: "Senior Developer",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          })
      })
    })

    it("allows users to read their own content", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("content-items").doc(itemId).get())
    })

    it("denies users from reading others' content", async () => {
      const db = testEnv.authenticatedContext(OTHER_USER.uid, { email: OTHER_USER.email, role: OTHER_USER.role }).firestore()
      await firebase.assertFails(db.collection("content-items").doc(itemId).get())
    })

    it("allows editors to create content items", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("content-items").add({
          userId: EDITOR_USER.uid,
          type: "skill",
          title: "TypeScript",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      )
    })

    it("prevents changing userId on update", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertFails(
        db.collection("content-items").doc(itemId).update({
          userId: OTHER_USER.uid,
        })
      )
    })
  })

  // ============================================================
  // EXPERIENCES COLLECTION TESTS
  // ============================================================

  describe("experiences collection", () => {
    const experienceId = "exp-123"

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("experiences")
          .doc(experienceId)
          .set({
            userId: EDITOR_USER.uid,
            type: "experience",
            company: "Tech Corp",
            title: "Software Engineer",
            startDate: "2020-01-01",
          })
      })
    })

    it("allows users to read their own experiences", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("experiences").doc(experienceId).get())
    })

    it("denies users from reading others' experiences", async () => {
      const db = testEnv.authenticatedContext(OTHER_USER.uid, { email: OTHER_USER.email, role: OTHER_USER.role }).firestore()
      await firebase.assertFails(db.collection("experiences").doc(experienceId).get())
    })

    it("allows editors to create experiences", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("experiences").add({
          userId: EDITOR_USER.uid,
          type: "experience",
          company: "New Corp",
          title: "Senior Engineer",
          startDate: "2021-01-01",
        })
      )
    })
  })

  // ============================================================
  // PERSONAL INFO COLLECTION TESTS
  // ============================================================

  describe("personal-info collection", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("personal-info")
          .doc(EDITOR_USER.uid)
          .set({
            name: "Editor User",
            email: "editor@example.com",
            phone: "555-1234",
          })
      })
    })

    it("allows users to read their own personal info", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("personal-info").doc(EDITOR_USER.uid).get())
    })

    it("denies users from reading others' personal info", async () => {
      const db = testEnv.authenticatedContext(OTHER_USER.uid, { email: OTHER_USER.email, role: OTHER_USER.role }).firestore()
      await firebase.assertFails(db.collection("personal-info").doc(EDITOR_USER.uid).get())
    })

    it("allows editors to update their own personal info", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("personal-info").doc(EDITOR_USER.uid).update({
          phone: "555-5678",
        })
      )
    })
  })

  // ============================================================
  // SHARED COLLECTIONS TESTS (Read-only from client)
  // ============================================================

  describe("job-matches collection (shared - read-only)", () => {
    const matchId = "match-123"

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("job-matches")
          .doc(matchId)
          .set({
            userId: VIEWER_USER.uid,
            jobTitle: "Software Engineer",
            company: "Tech Corp",
            matchScore: 85,
          })
      })
    })

    it("allows viewers to read their own matches", async () => {
      const db = testEnv.authenticatedContext(VIEWER_USER.uid, { email: VIEWER_USER.email, role: VIEWER_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("job-matches").doc(matchId).get())
    })

    it("denies users from writing to job-matches", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertFails(
        db.collection("job-matches").add({
          userId: EDITOR_USER.uid,
          jobTitle: "Test",
        })
      )
    })

    it("allows admins to write to job-matches", async () => {
      const db = testEnv.authenticatedContext(ADMIN_USER.uid, { email: ADMIN_USER.email, role: ADMIN_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("job-matches").add({
          userId: ADMIN_USER.uid,
          jobTitle: "Test",
        })
      )
    })
  })

  describe("companies collection (shared - read-only)", () => {
    const companyId = "company-123"

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .collection("companies")
          .doc(companyId)
          .set({
            name: "Tech Corp",
            website: "https://techcorp.com",
          })
      })
    })

    it("allows authenticated users to read companies", async () => {
      const db = testEnv.authenticatedContext(VIEWER_USER.uid, { email: VIEWER_USER.email, role: VIEWER_USER.role }).firestore()
      await firebase.assertSucceeds(db.collection("companies").doc(companyId).get())
    })

    it("denies non-admins from writing to companies", async () => {
      const db = testEnv.authenticatedContext(EDITOR_USER.uid, { email: EDITOR_USER.email, role: EDITOR_USER.role }).firestore()
      await firebase.assertFails(
        db.collection("companies").add({
          name: "New Corp",
        })
      )
    })

    it("allows admins to write to companies", async () => {
      const db = testEnv.authenticatedContext(ADMIN_USER.uid, { email: ADMIN_USER.email, role: ADMIN_USER.role }).firestore()
      await firebase.assertSucceeds(
        db.collection("companies").add({
          name: "New Corp",
        })
      )
    })
  })

  // ============================================================
  // UNAUTHENTICATED ACCESS TESTS
  // ============================================================

  describe("unauthenticated access", () => {
    it("denies all unauthenticated reads", async () => {
      const db = testEnv.unauthenticatedContext().firestore()
      await firebase.assertFails(db.collection("job-queue").doc("test").get())
      await firebase.assertFails(db.collection("generator-documents").doc("test").get())
      await firebase.assertFails(db.collection("content-items").doc("test").get())
    })

    it("denies all unauthenticated writes", async () => {
      const db = testEnv.unauthenticatedContext().firestore()
      await firebase.assertFails(
        db.collection("job-queue").add({
          url: "https://example.com",
        })
      )
    })
  })
})

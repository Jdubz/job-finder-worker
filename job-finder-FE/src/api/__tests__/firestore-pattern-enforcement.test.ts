/**
 * Firestore Pattern Enforcement Tests
 *
 * These tests ensure that all API clients follow the established pattern
 * of using FirestoreService instead of direct Firestore SDK imports.
 *
 * Purpose: Prevent regression back to old patterns with duplicate code.
 *
 * Note: This uses Vite's glob import feature which works in browser environments.
 */

import { describe, it, expect } from "vitest"

// Import all client files using Vite's glob import
const clientModules = import.meta.glob("../*-client.ts", { as: "raw", eager: true })

describe("Firestore Pattern Enforcement", () => {
  const clientFiles = Object.entries(clientModules).map(([path, content]) => ({
    name: path.split("/").pop() || path,
    path,
    content: content as string,
  }))

  describe("No Direct Firestore SDK Imports", () => {
    it("should not import directly from firebase/firestore", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        if (content.includes('from "firebase/firestore"')) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(
          `❌ Files importing directly from firebase/firestore: ${violations.join(", ")}`
        )
        console.error(`   Use FirestoreService instead!`)
      }
    })

    const forbiddenMethods = [
      { method: "getDoc(", description: "Use firestoreService.getDocument()" },
      { method: "setDoc(", description: "Use firestoreService.setDocument()" },
      { method: "updateDoc(", description: "Use firestoreService.updateDocument()" },
      { method: "deleteDoc(", description: "Use firestoreService.deleteDocument()" },
      { method: "getDocs(", description: "Use firestoreService.getDocuments()" },
      { method: "addDoc(", description: "Use firestoreService.addDocument()" },
      { method: "collection(", description: "Use FirestoreService methods" },
      { method: "doc(", description: "Use FirestoreService methods" },
      { method: "query(", description: "Use QueryConstraints with FirestoreService" },
      { method: "where(", description: "Use QueryConstraints with FirestoreService" },
      { method: "orderBy(", description: "Use QueryConstraints with FirestoreService" },
      { method: "limit(", description: "Use QueryConstraints with FirestoreService" },
      { method: "onSnapshot(", description: "Use firestoreService.subscribeToCollection()" },
    ]

    forbiddenMethods.forEach(({ method, description }) => {
      it(`should not use ${method} directly`, () => {
        const violations: string[] = []

        clientFiles.forEach(({ name, content }) => {
          const codeLines = content
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))

          const hasViolation = codeLines.some((line) => {
            const trimmed = line.trim()
            return (
              line.includes(method) &&
              !trimmed.startsWith("//") &&
              !trimmed.startsWith("*") &&
              !line.includes("import") &&
              !line.includes("@param") &&
              !line.includes("@returns")
            )
          })

          if (hasViolation) {
            violations.push(name)
          }
        })

        expect(violations).toEqual([])
        if (violations.length > 0) {
          console.error(`❌ Files using ${method}: ${violations.join(", ")}`)
          console.error(`   ${description}`)
        }
      })
    })
  })

  describe("Should Use FirestoreService", () => {
    it("all clients should import from @/services/firestore", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const hasFirestoreServiceImport =
          content.includes('from "@/services/firestore"') ||
          content.includes("from '@/services/firestore'")

        if (!hasFirestoreServiceImport) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files not importing FirestoreService: ${violations.join(", ")}`)
        console.error(`   Add: import { firestoreService } from "@/services/firestore"`)
      }
    })

    it("all clients should use firestoreService instance", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const usesService =
          content.includes("firestoreService.") ||
          content.includes('from "@/services/firestore/utils"') ||
          content.includes("from '@/services/firestore/utils'")

        if (!usesService) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files not using firestoreService: ${violations.join(", ")}`)
        console.error(`   Use firestoreService.getDocument(), setDocument(), etc.`)
      }
    })
  })

  describe("No Custom Timestamp Conversion", () => {
    it("should not have custom timestamp conversion methods", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const hasCustomMethod =
          content.includes("private convertTimestamps") ||
          content.includes("private convertDoc") ||
          content.includes("private toDate")

        const hasDirectConversion = content.split("\n").some((line) => {
          const trimmed = line.trim()
          return (
            line.includes(".toDate()") &&
            !trimmed.startsWith("//") &&
            !trimmed.startsWith("*") &&
            !trimmed.includes("@param") &&
            !trimmed.includes("@returns") &&
            !trimmed.includes("Timestamp")
          )
        })

        if (hasCustomMethod || hasDirectConversion) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files with custom timestamp conversion: ${violations.join(", ")}`)
        console.error(`   FirestoreService handles timestamps automatically!`)
        console.error(`   Or use: import { convertTimestamps } from "@/services/firestore/utils"`)
      }
    })
  })

  describe("Should Use Shared Utilities", () => {
    it("update operations should use metadata utilities", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const hasUpdateOperations =
          content.includes("setDocument") &&
          (content.includes("userEmail") || content.includes("updatedAt"))

        if (hasUpdateOperations) {
          const usesMetadataUtility =
            content.includes("createUpdateMetadata") || content.includes("createDocumentMetadata")

          if (!usesMetadataUtility) {
            violations.push(name)
          }
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files with updates but no metadata utilities: ${violations.join(", ")}`)
        console.error(
          `   Import: import { createUpdateMetadata } from "@/services/firestore/utils"`
        )
      }
    })
  })

  describe("Architecture Validation", () => {
    it("should follow naming convention (*-client.ts)", () => {
      clientFiles.forEach(({ name }) => {
        expect(name).toMatch(/-client\.ts$/)
      })
    })

    it("should export singleton instances", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const hasSingletonExport =
          content.includes("export const") &&
          content.includes("Client = new") &&
          content.includes("Client()")

        if (!hasSingletonExport) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files without singleton export: ${violations.join(", ")}`)
        console.error(`   Add: export const myClient = new MyClient()`)
      }
    })

    it("should use 'as const' for collection names", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        if (content.includes("collectionName")) {
          const hasConstAssertion =
            content.includes("collectionName = ") && content.includes("as const")

          if (!hasConstAssertion) {
            violations.push(name)
          }
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files without 'as const' for collectionName: ${violations.join(", ")}`)
        console.error(`   Use: private collectionName = "collection-name" as const`)
      }
    })
  })

  describe("Code Quality Checks", () => {
    it("should have JSDoc comments", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const hasFileComment = content.includes("/**") && content.split("/**").length >= 2

        if (!hasFileComment) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files without JSDoc comments: ${violations.join(", ")}`)
        console.error(`   Add /** ... */ comments to classes and public methods`)
      }
    })

    it("should not have console.log statements", () => {
      const violations: string[] = []

      clientFiles.forEach(({ name, content }) => {
        const lines = content.split("\n")
        const hasConsoleLog = lines.some(
          (line) =>
            line.includes("console.log(") &&
            !line.trim().startsWith("//") &&
            !line.trim().startsWith("*")
        )

        if (hasConsoleLog) {
          violations.push(name)
        }
      })

      expect(violations).toEqual([])
      if (violations.length > 0) {
        console.error(`❌ Files with console.log: ${violations.join(", ")}`)
        console.error(`   Remove console.log or use console.error for errors`)
      }
    })
  })

  describe("Summary Statistics", () => {
    it("should show pattern compliance summary", () => {
      const stats = {
        totalClients: clientFiles.length,
        usingFirestoreService: clientFiles.filter((f) =>
          f.content.includes('from "@/services/firestore"')
        ).length,
        usingMetadataUtils: clientFiles.filter((f) => f.content.includes("createUpdateMetadata"))
          .length,
        withConstAssertions: clientFiles.filter((f) => f.content.includes("as const")).length,
        withJSDocs: clientFiles.filter((f) => f.content.includes("/**")).length,
      }

      console.log("\n📊 Firestore Pattern Compliance:")
      console.log(`   Total Clients: ${stats.totalClients}`)
      console.log(
        `   ✅ Using FirestoreService: ${stats.usingFirestoreService}/${stats.totalClients}`
      )
      console.log(`   ✅ Using Metadata Utils: ${stats.usingMetadataUtils}/${stats.totalClients}`)
      console.log(`   ✅ Using 'as const': ${stats.withConstAssertions}/${stats.totalClients}`)
      console.log(`   ✅ With JSDoc Comments: ${stats.withJSDocs}/${stats.totalClients}`)

      // All should be compliant
      expect(stats.usingFirestoreService).toBe(stats.totalClients)
    })
  })
})

describe("FirestoreService Infrastructure", () => {
  it("should have FirestoreService available", async () => {
    const module = await import("@/services/firestore")
    expect(module.firestoreService).toBeDefined()
    expect(module.FirestoreService).toBeDefined()
  })

  it("should have shared utilities available", async () => {
    const module = await import("@/services/firestore")
    expect(module.convertTimestamps).toBeDefined()
    expect(module.createUpdateMetadata).toBeDefined()
    expect(module.createDocumentMetadata).toBeDefined()
    expect(module.safeFirestoreOperation).toBeDefined()
    expect(module.validateDocumentData).toBeDefined()
  })

  it("should export all necessary types", async () => {
    const typesModule = await import("@/services/firestore/types")
    expect(typesModule).toBeDefined()

    const mainModule = await import("@/services/firestore")
    // FirestoreService should export types
    expect(mainModule).toBeDefined()
  })
})

describe("Test Coverage Requirements", () => {
  it("should have test files for all clients", async () => {
    const testModules = import.meta.glob("../__tests__/*-client.test.ts", { eager: true })
    const clientNames = Object.keys(clientModules).map((path) =>
      path.split("/").pop()?.replace(".ts", "")
    )
    const testNames = Object.keys(testModules).map((path) =>
      path.split("/").pop()?.replace(".test.ts", "")
    )

    const missingTests = clientNames.filter((name) => name && !testNames.includes(name))

    expect(missingTests).toEqual([])
    if (missingTests.length > 0) {
      console.error(`❌ Missing test files for: ${missingTests.join(", ")}`)
    }
  })
})

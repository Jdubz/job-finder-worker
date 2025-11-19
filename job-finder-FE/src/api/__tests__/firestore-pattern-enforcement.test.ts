import { describe, it, expect } from "vitest"

const clientModules = import.meta.glob("../*-client.ts", { as: "raw", eager: true })

const clientFiles = Object.entries(clientModules).map(([path, content]) => ({
  name: path.split("/").pop() || path,
  path,
  content: content as string,
}))

describe("API Clients", () => {
  it("never import firebase/firestore", () => {
    const violations = clientFiles.filter(({ content }) =>
      content.includes("firebase/firestore")
    )
    expect(violations).toEqual([])
  })

  it("do not depend on firestoreService", () => {
    const violations = clientFiles.filter(({ content }) =>
      content.includes("firestoreService")
    )
    expect(violations).toEqual([])
  })

  it("extend BaseApiClient", () => {
    const violations = clientFiles
      .filter(({ name }) => name !== "base-client.ts")
      .filter(({ content }) => !content.includes("extends BaseApiClient"))
    expect(violations).toEqual([])
  })
})

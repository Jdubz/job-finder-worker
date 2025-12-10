/**
 * Post-build script for job-applicator Electron app.
 *
 * Handles:
 * 1. Copies static assets (HTML, CSS) to dist/renderer/
 * 2. Strips TypeScript's "export {}" from app.js (causes ES module issues in renderer)
 * 3. Renames preload.js to preload.cjs (Electron requires CommonJS for preload)
 * 4. Strips "export {}" from preload.cjs
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, "../dist")
const srcDir = path.resolve(__dirname, "../src")

// 1. Copy static assets
console.log("[postbuild] Copying static assets...")
fs.cpSync(path.join(srcDir, "renderer/index.html"), path.join(distDir, "renderer/index.html"))
fs.cpSync(path.join(srcDir, "renderer/styles.css"), path.join(distDir, "renderer/styles.css"))

// 2. Strip "export {}" from app.js
const appJsPath = path.join(distDir, "renderer/app.js")
if (fs.existsSync(appJsPath)) {
  console.log("[postbuild] Stripping export {} from app.js...")
  const appContent = fs.readFileSync(appJsPath, "utf8")
  fs.writeFileSync(appJsPath, appContent.replace(/export\s*\{\s*\};?\s*$/, ""))
}

// 3. Rename preload.js to preload.cjs
const preloadJsPath = path.join(distDir, "preload.js")
const preloadCjsPath = path.join(distDir, "preload.cjs")
if (fs.existsSync(preloadJsPath)) {
  console.log("[postbuild] Renaming preload.js to preload.cjs...")
  fs.rmSync(preloadCjsPath, { force: true })
  fs.renameSync(preloadJsPath, preloadCjsPath)
}

// 4. Strip "export {}" from preload.cjs
if (fs.existsSync(preloadCjsPath)) {
  console.log("[postbuild] Stripping export {} from preload.cjs...")
  const preloadContent = fs.readFileSync(preloadCjsPath, "utf8")
  fs.writeFileSync(preloadCjsPath, preloadContent.replace(/export\s*\{\s*\};?\s*$/, ""))
}

console.log("[postbuild] Done!")

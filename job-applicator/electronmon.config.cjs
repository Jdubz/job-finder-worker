module.exports = {
  patterns: [
    // Watch compiled output
    "dist/**/*",
    // Watch renderer files
    "src/renderer/**/*",
  ],
  ignore: [
    // Ignore logs - these change during runtime
    "logs/**",
    "*.log",
    // Ignore MCP config - written during form fill
    "mcp-config.json",
    // Ignore node_modules
    "node_modules/**",
    // Ignore source (watch:build handles recompilation)
    "src/**/*.ts",
    // Ignore test files
    "**/*.test.ts",
    // Ignore mcp-server source (watch:build handles it)
    "mcp-server/src/**",
  ],
}

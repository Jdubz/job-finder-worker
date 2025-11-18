import { defineConfig } from 'vitest/config'

/**
 * Safe Vitest Configuration - job-finder-BE
 * 
 * Prevents test explosions through strict file inclusion and process limits.
 */

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    
    // CRITICAL: Only include test files from source directory
    include: ['functions/src/**/*.{test,spec}.{ts,tsx}', 'functions/test/**/*.{test,spec}.{ts,tsx}'],
    
    // CRITICAL: Exclude everything else to prevent explosions
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.{git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
    
    // CRITICAL: Single process execution - NO parallelism
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,  // ONLY 1 process at a time
        minForks: 1,
      },
    },
    
    // CRITICAL: No file parallelism
    fileParallelism: false,
    
    // CRITICAL: No test parallelism
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ]
    }
  }
})

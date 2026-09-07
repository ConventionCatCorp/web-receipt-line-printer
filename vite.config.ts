/// <reference types="vitest" />
import path from 'path';
import packageJson from './package.json';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import eslint from 'vite-plugin-eslint';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: packageJson.name,
    },
    // Inlining a dependency gives consumers that also import it two copies of
    // the same classes, so instanceof across the boundary fails.
    rollupOptions: {
      external: Object.keys(packageJson.dependencies),
      output: {
        globals: { 'web-device-mux': 'WebDeviceMux' },
      },
    },
    minify: false,
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
  plugins: [
    dts({
      exclude: [
        '**/node_modules',
        '**/*.test.ts'
      ]
    }),
    eslint({
      failOnError: false
    })
  ],
  test: {
    environment: 'happy-dom',
    includeSource: ['src/**/*.{js,ts}'],
    // Not part of this package's test surface, and it carries a symlink to a
    // local web-device-mux checkout whose tests would be collected from here.
    exclude: ['node_modules/**', 'dist/**', 'demo/**'],
    coverage: {
      enabled: true,
      // you can include other reporters, but 'json-summary' is required, json is recommended
      reporter: ['text', 'json-summary', 'json'],
      // If you want a coverage reports even if your tests are failing, include the reportOnFailure option
      reportOnFailure: true,
      include: ['src/**']
    }
  }
});

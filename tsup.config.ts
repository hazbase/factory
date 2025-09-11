import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  clean: true,
  outDir: 'dist',
  target: 'es2020',
  outExtension() { return {js: '.mjs'} },
  banner: {
    js: 'import { createRequire } from "module";' +
        'const require = createRequire(import.meta.url);'
  }
});

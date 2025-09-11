#!/usr/bin/env node
// ESM launcher – simply imports the compiled CLI

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath   = resolve(__dirname, '../dist/cli.mjs');

import(cliPath)
  .then(mod => {
    if (typeof mod.main !== 'function') {
      console.error('❌ CLI entry "main" not found');
      process.exit(1);
    }
    mod.main(process.argv).catch(err => {
      console.error(err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
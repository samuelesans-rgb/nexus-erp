// Test setup to mock server-only module
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock server-only
const serverOnlyPath = resolve(__dirname, '../stubs/server-only/index.js');
const serverOnlyModule = {
  id: 'server-only',
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  parent: undefined,
  children: [] as Array<unknown>,
  paths: [] as string[],
  isPreloading: false,
  path: __dirname,
  require,
};
require.cache[require.resolve('server-only')] = serverOnlyModule as unknown as typeof require.cache[string];

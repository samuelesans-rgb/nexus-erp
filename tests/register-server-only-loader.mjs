import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolvePath(__filename, '..');
const stubPath = resolvePath(__dirname, 'stubs/server-only/index.js');
const stubUrl = pathToFileURL(stubPath).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return {
      shortCircuit: true,
      url: stubUrl,
    };
  }

  return nextResolve(specifier, context);
}

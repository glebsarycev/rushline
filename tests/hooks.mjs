// Lets Node resolve the browser import map entries ("three", "three/addons/...")
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeURL = pathToFileURL(path.join(root, 'vendor/three/build/three.module.js')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: threeURL, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) {
      const rel = specifier.slice('three/addons/'.length);
      return { url: pathToFileURL(path.join(root, 'vendor/three/addons', rel)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

import {cp, mkdir, readdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid output directory');
await rm(output, {recursive: true, force: true});
const publicExtensions = new Set(['.html','.css','.js','.jpg','.png','.svg','.txt']);
await cp(path.join(root, 'src'), output, {recursive: true, filter: async name => {
  if (path.basename(name).startsWith('.')) return false;
  return (await stat(name)).isDirectory() || publicExtensions.has(path.extname(name));
}});
await mkdir(path.join(output, 'data'), {recursive: true});
for (const name of ['stations.json', 'metro-3d.json', 'cruise-routes.json']) {
  await cp(path.join(root, 'data', name), path.join(output, 'data', name));
}
for (const name of await readdir(output)) {
  if (!name.endsWith('.html')) continue;
  const text = await readFile(path.join(output, name), 'utf8');
  if (text.includes('待人工核对') || !text.includes('site-shell.js')) throw new Error('Incomplete page: ' + name);
}
console.log('Built dist/ from source and public datasets. Local records are excluded.');

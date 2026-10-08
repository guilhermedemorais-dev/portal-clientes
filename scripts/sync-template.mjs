import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_PATHS = [
  'src', 'public', 'backend/src', 'backend/migrations', 'docs/design', 'docs/specs/mod-001', 'docs/portal',
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'backend/package.json', 'backend/package-lock.json', 'backend/tsconfig.json',
  'backend/Dockerfile', 'backend/compose.yaml', 'backend/README.md', 'backend/.env.example',
];
const BASELINE_NAME = '.template-baseline.json';
const IGNORED_NAMES = new Set(['.git', 'node_modules', 'dist', 'coverage', 'private-uploads']);

const hash = (data) => createHash('sha256').update(data).digest('hex');

async function existsRegular(file) {
  try { const stat = await lstat(file); return stat.isFile() && !stat.isSymbolicLink(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function listFiles(sourceRoot, relativePaths) {
  const files = [];
  for (const relative of relativePaths) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error(`Unsafe template path: ${relative}`);
    const absolute = path.join(sourceRoot, relative);
    let stat;
    try { stat = await lstat(absolute); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link in template source: ${relative}`);
    if (stat.isFile()) { files.push(relative); continue; }
    if (!stat.isDirectory()) continue;
    async function walk(directory, prefix) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
        const childRelative = path.posix.join(prefix, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in template source: ${childRelative}`);
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), childRelative);
        else if (entry.isFile()) files.push(childRelative);
      }
    }
    await walk(absolute, relative);
  }
  return [...new Set(files)].sort();
}

async function assertNoSymlinkPath(root, relative, allowMissing = true) {
  const segments = relative.split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Refusing to write through symbolic link: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!allowMissing) throw error;
    }
  }
}

export async function syncTemplate({ sourceRoot, targetProject, apply = false, paths = DEFAULT_PATHS }) {
  const source = await realpath(sourceRoot);
  const project = await realpath(targetProject);
  const gitStat = await lstat(path.join(project, '.git')).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!gitStat) throw new Error('Target must be an existing Git checkout containing .git');
  const target = path.join(project, 'docs', 'portal');
  await assertNoSymlinkPath(project, 'docs/portal');

  const targetFiles = await listFiles(source, paths);
  const manifestPath = path.join(target, BASELINE_NAME);
  let prior = {};
  if (await existsRegular(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.format !== 1 || !manifest.files || typeof manifest.files !== 'object') throw new Error('Invalid manifest structure');
      prior = manifest.files;
    } catch { throw new Error('Template baseline manifest is invalid; stop and review it before updating'); }
  }

  const plan = [];
  const sourceHashes = {};
  for (const relative of targetFiles) {
    const src = path.join(source, relative);
    const bytes = await readFile(src);
    const upstreamHash = hash(bytes);
    sourceHashes[relative] = upstreamHash;
    const dest = path.join(target, relative);
    await assertNoSymlinkPath(target, relative);
    const destExists = await existsRegular(dest);
    if (!destExists) { plan.push({ path: relative, action: 'add' }); continue; }
    const localHash = hash(await readFile(dest));
    if (localHash === upstreamHash) { plan.push({ path: relative, action: 'unchanged' }); continue; }
    const previousHash = prior[relative];
    if (!previousHash) { plan.push({ path: relative, action: 'conflict', reason: 'existing file has no upstream baseline' }); continue; }
    if (localHash === previousHash) { plan.push({ path: relative, action: 'update' }); continue; }
    if (upstreamHash === previousHash) { plan.push({ path: relative, action: 'preserve', reason: 'client customization' }); sourceHashes[relative] = previousHash; continue; }
    plan.push({ path: relative, action: 'conflict', reason: 'both client and template changed since the previous baseline' });
    sourceHashes[relative] = previousHash;
  }

  if (apply) {
    await mkdir(target, { recursive: true });
    for (const item of plan) {
      if (!['add', 'update'].includes(item.action)) continue;
      const destination = path.join(target, item.path);
      await assertNoSymlinkPath(target, item.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(path.join(source, item.path)), { flag: item.action === 'add' ? 'wx' : 'w' });
    }
    const oldFiles = prior;
    const baselineFiles = { ...oldFiles, ...sourceHashes };
    const manifest = { format: 1, source: 'portal-clientes', updatedAt: new Date().toISOString(), files: baselineFiles };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  }
  return { applied: apply, target: path.relative(project, target), plan, conflicts: plan.filter((item) => item.action === 'conflict'), preserved: plan.filter((item) => item.action === 'preserve') };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const projectArgument = args.find((arg) => arg.startsWith('--project='))?.slice('--project='.length);
  const sourceArgument = args.find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  if (!projectArgument || args.includes('--help')) {
    console.log('Usage: node scripts/sync-template.mjs --project=/path/to/client-repo [--source=/path/to/portal-clientes] [--apply]');
    console.log('Without --apply, only a dry-run plan is produced. Conflicts are never overwritten.');
    return;
  }
  const result = await syncTemplate({ sourceRoot: sourceArgument || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), targetProject: path.resolve(projectArgument), apply });
  console.log(JSON.stringify(result, null, 2));
  if (result.conflicts.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

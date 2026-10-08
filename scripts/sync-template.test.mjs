import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { syncTemplate } from './sync-template.mjs';

const temporary = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'portal-template-'));
  temporary.push(root);
  const source = path.join(root, 'source');
  const project = path.join(root, 'client');
  await mkdir(path.join(source, 'src'), { recursive: true });
  await mkdir(path.join(source, 'backend'), { recursive: true });
  await mkdir(path.join(source, 'node_modules'), { recursive: true });
  await mkdir(path.join(project, '.git'), { recursive: true });
  await writeFile(path.join(source, 'src', 'main.tsx'), 'version 1');
  await writeFile(path.join(source, 'backend', 'secret.txt'), 'must not copy');
  await writeFile(path.join(source, 'node_modules', 'lib.js'), 'must not copy');
  return { root, source, project, target: path.join(project, 'docs', 'portal') };
}
afterEach(async () => { await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

describe('syncTemplate', () => {
  it('plans without writing into the client project', async () => {
    const { source, project, target } = await fixture();
    const result = await syncTemplate({ sourceRoot: source, targetProject: project });
    assert.equal(result.applied, false);
    await assert.rejects(readFile(path.join(target, 'src', 'main.tsx')));
    await assert.rejects(readFile(path.join(target, '.template-baseline.json')));
  });

  it('copies only allowlisted files and never copies git, dependencies or secrets', async () => {
    const { source, project, target } = await fixture();
    const result = await syncTemplate({ sourceRoot: source, targetProject: project, apply: true });
    assert.equal(result.applied, true);
    assert.equal(await readFile(path.join(target, 'src', 'main.tsx'), 'utf8'), 'version 1');
    await assert.rejects(readFile(path.join(target, 'backend', 'secret.txt')));
    await assert.rejects(readFile(path.join(target, 'node_modules', 'lib.js')));
    assert.equal((await readFile(path.join(target, '.template-baseline.json'), 'utf8')).includes('secret'), false);
  });

  it('preserves client edits and reports conflict when upstream and client changed the same file', async () => {
    const { source, project, target } = await fixture();
    await syncTemplate({ sourceRoot: source, targetProject: project, apply: true });
    await writeFile(path.join(target, 'src', 'main.tsx'), 'client customization');
    await writeFile(path.join(source, 'src', 'main.tsx'), 'version 2');
    const result = await syncTemplate({ sourceRoot: source, targetProject: project, apply: true });
    assert.equal(await readFile(path.join(target, 'src', 'main.tsx'), 'utf8'), 'client customization');
    assert.equal(result.conflicts.length, 1);
  });
});

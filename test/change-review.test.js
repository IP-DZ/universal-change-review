import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beginSnapshot, diffSince, workingDiff, workingSummary } from '../src/git.js'
import { git } from '../src/git.js'
import { closePanel, openPanel } from '../src/panel.js'

test('reports tracked and untracked changes', () => {
  const root = repositoryFixture()
  writeFileSync(join(root, 'tracked.txt'), 'after\n')
  writeFileSync(join(root, 'new.txt'), 'new\n')
  const summary = workingSummary(root)
  assert.match(summary.status, /tracked\.txt/)
  assert.match(summary.status, /new\.txt/)
  assert.deepEqual(summary.files.map((file) => file.path).sort(), ['new.txt', 'tracked.txt'])
  const result = workingDiff(root)
  assert.match(result.diff, /after/)
  assert.match(result.diff, /new\.txt/)
})

test('serves a token-protected read-only Changes panel', async () => {
  const root = repositoryFixture()
  writeFileSync(join(root, 'tracked.txt'), 'panel change\n')
  const panel = await openPanel(root)
  try {
    const page = await fetch(panel.url)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Universal Change Review/)

    const unauthorized = await fetch(`http://127.0.0.1:${panel.port}/api/state`)
    assert.equal(unauthorized.status, 403)

    const token = new URL(panel.url).searchParams.get('token')
    const state = await fetch(`http://127.0.0.1:${panel.port}/api/state?token=${token}&scope=all`).then((response) => response.json())
    assert.equal(state.files[0].path, 'tracked.txt')
    const diff = await fetch(`http://127.0.0.1:${panel.port}/api/diff?token=${token}&scope=all&file=tracked.txt`).then((response) => response.json())
    assert.match(diff.diff, /panel change/)
  } finally {
    await closePanel(root)
  }
})

test('task snapshot excludes changes that existed before the task', () => {
  const root = repositoryFixture()
  writeFileSync(join(root, 'tracked.txt'), 'preexisting\n')
  const snapshot = beginSnapshot(root, 'test')
  writeFileSync(join(root, 'tracked.txt'), 'task change\n')
  writeFileSync(join(root, 'task.txt'), 'created in task\n')
  const result = diffSince(root, snapshot.id)
  assert.match(result.diff, /task change/)
  assert.match(result.diff, /task\.txt/)
  assert.doesNotMatch(result.diff, /^\+preexisting$/m)
})

function repositoryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ucr-test-'))
  git(['init'], root)
  git(['config', 'user.email', 'test@example.com'], root)
  git(['config', 'user.name', 'Test'], root)
  writeFileSync(join(root, 'tracked.txt'), 'before\n')
  git(['add', '.'], root)
  git(['commit', '-m', 'initial'], root)
  return root
}

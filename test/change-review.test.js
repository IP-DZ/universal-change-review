import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beginSnapshot, diffSince, workingDiff, workingSummary } from '../src/git.js'
import { git } from '../src/git.js'

test('reports tracked and untracked changes', () => {
  const root = repositoryFixture()
  writeFileSync(join(root, 'tracked.txt'), 'after\n')
  writeFileSync(join(root, 'new.txt'), 'new\n')
  const summary = workingSummary(root)
  assert.match(summary.status, /tracked\.txt/)
  assert.match(summary.status, /new\.txt/)
  const result = workingDiff(root)
  assert.match(result.diff, /after/)
  assert.match(result.diff, /new\.txt/)
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

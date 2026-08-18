import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const MAX_OUTPUT = 16 * 1024 * 1024

export function git(args, cwd, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
    env: { ...process.env, ...(options.env ?? {}) },
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || `git exited ${result.status}`).trim()
    throw new Error(detail)
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export function repository(cwd = process.cwd()) {
  const requested = resolve(cwd.replace(/^~(?=$|\/)/, homedir()))
  const root = git(['rev-parse', '--show-toplevel'], requested).stdout.trim()
  const gitDirRaw = git(['rev-parse', '--git-dir'], root).stdout.trim()
  const gitDir = isAbsolute(gitDirRaw) ? gitDirRaw : resolve(root, gitDirRaw)
  return { root, gitDir }
}

export function captureTree(cwd = process.cwd()) {
  const repo = repository(cwd)
  const tempIndex = join(tmpdir(), `universal-change-review-${randomUUID()}.index`)
  const realIndex = join(repo.gitDir, 'index')
  const env = { GIT_INDEX_FILE: tempIndex }
  try {
    if (existsSync(realIndex)) copyFileSync(realIndex, tempIndex)
    else git(['read-tree', 'HEAD'], repo.root, { env, allowFailure: true })
    git(['add', '-A', '--', '.'], repo.root, { env })
    const tree = git(['write-tree'], repo.root, { env }).stdout.trim()
    return { ...repo, tree }
  } finally {
    rmSync(tempIndex, { force: true })
  }
}

export function workingSummary(cwd = process.cwd(), scope = 'all') {
  const repo = repository(cwd)
  const args = scopeArgs(scope, true)
  const status = git(['status', '--porcelain=v1', '--untracked-files=all'], repo.root).stdout
  let stat = git(['diff', ...args, '--stat'], repo.root).stdout
  let numstat = git(['diff', ...args, '--numstat'], repo.root).stdout
  if (scope !== 'staged') {
    const untracked = untrackedStats(repo.root)
    stat += untracked.stat
    numstat += untracked.numstat
  }
  return { root: repo.root, scope, status, stat, files: parseNumstat(numstat) }
}

export function workingDiff(cwd = process.cwd(), { scope = 'all', file, maxChars = 120000 } = {}) {
  const repo = repository(cwd)
  const args = ['diff', ...scopeArgs(scope, false), '--no-ext-diff', '--no-color']
  if (file) args.push('--', file)
  let diff = git(args, repo.root).stdout
  if (scope !== 'staged') diff += untrackedDiff(repo.root, file)
  return truncate({ root: repo.root, scope, file: file ?? null, diff }, maxChars)
}

export function beginSnapshot(cwd = process.cwd(), label = 'task') {
  const captured = captureTree(cwd)
  const store = loadStore(captured.gitDir)
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  store.snapshots[id] = { id, label, tree: captured.tree, createdAt: new Date().toISOString() }
  saveStore(captured.gitDir, store)
  return { root: captured.root, ...store.snapshots[id] }
}

export function diffSince(cwd = process.cwd(), id, maxChars = 120000) {
  if (!id) throw new Error('snapshot id is required')
  const repo = repository(cwd)
  const store = loadStore(repo.gitDir)
  const snapshot = store.snapshots[id]
  if (!snapshot) throw new Error(`snapshot not found: ${id}`)
  const current = captureTree(repo.root)
  const diff = git(['diff', '--no-ext-diff', '--no-color', snapshot.tree, current.tree], repo.root).stdout
  const stat = git(['diff', '--stat', snapshot.tree, current.tree], repo.root).stdout
  const numstat = git(['diff', '--numstat', snapshot.tree, current.tree], repo.root).stdout
  return truncate({ root: repo.root, snapshot, currentTree: current.tree, stat, files: parseNumstat(numstat), diff }, maxChars)
}

export function listSnapshots(cwd = process.cwd()) {
  const repo = repository(cwd)
  return { root: repo.root, snapshots: Object.values(loadStore(repo.gitDir).snapshots) }
}

function scopeArgs(scope, stat) {
  if (scope === 'staged') return ['--cached']
  if (scope === 'unstaged') return []
  if (scope === 'all') return stat ? ['HEAD'] : ['HEAD']
  throw new Error('scope must be all, staged, or unstaged')
}

function parseNumstat(text) {
  return text.trim() ? text.trim().split('\n').map((line) => {
    const [added, deleted, ...path] = line.split('\t')
    return { path: path.join('\t'), added: added === '-' ? null : Number(added), deleted: deleted === '-' ? null : Number(deleted) }
  }) : []
}

function untrackedDiff(root, onlyFile) {
  const paths = git(['ls-files', '--others', '--exclude-standard'], root).stdout.trim().split('\n').filter(Boolean)
    .filter((path) => !onlyFile || path === onlyFile)
  let output = ''
  for (const path of paths) {
    const result = git(['diff', '--no-index', '--no-color', '--', '/dev/null', path], root, { allowFailure: true })
    if (result.status === 1) output += result.stdout
  }
  return output
}

function untrackedStats(root) {
  const paths = git(['ls-files', '--others', '--exclude-standard'], root).stdout.trim().split('\n').filter(Boolean)
  let stat = ''
  let numstat = ''
  for (const path of paths) {
    const content = readFileSync(join(root, path))
    const binary = content.includes(0)
    const added = binary ? '-' : lineCount(content.toString('utf8'))
    stat += binary ? ` ${path} | Bin 0 -> ${content.length} bytes\n` : ` ${path} | ${added} +\n`
    numstat += `${added}\t${binary ? '-' : 0}\t${path}\n`
  }
  return { stat, numstat }
}

function lineCount(text) {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function storePath(gitDir) {
  return join(gitDir, 'universal-change-review', 'snapshots.json')
}

function loadStore(gitDir) {
  const path = storePath(gitDir)
  if (!existsSync(path)) return { version: 1, snapshots: {} }
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return { version: 1, snapshots: {} } }
}

function saveStore(gitDir, value) {
  const path = storePath(gitDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function truncate(value, maxChars) {
  const limit = Math.max(1000, Math.min(Number(maxChars) || 120000, 1000000))
  if (value.diff.length <= limit) return { ...value, truncated: false }
  return { ...value, diff: value.diff.slice(0, limit), truncated: true, originalChars: value.diff.length }
}

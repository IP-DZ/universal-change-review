import { beginSnapshot, diffSince, listSnapshots, workingDiff, workingSummary } from './git.js'

const tools = [
  tool('changes_summary', 'Summarize current Git changes without modifying files.', {
    cwd: string('Repository path; defaults to server cwd.'), scope: enumValue(['all', 'staged', 'unstaged'], 'all'),
  }),
  tool('changes_diff', 'Return a local Git diff, optionally limited to one file.', {
    cwd: string('Repository path; defaults to server cwd.'), scope: enumValue(['all', 'staged', 'unstaged'], 'all'), file: string('Optional workspace-relative file path.'), maxChars: number('Maximum diff characters.', 120000),
  }),
  tool('changes_begin', 'Capture a task baseline using a temporary Git index. The worktree and real index are not changed.', {
    cwd: string('Repository path; defaults to server cwd.'), label: string('Human-readable snapshot label.'),
  }),
  tool('changes_since', 'Compare the current repository state with a previous task baseline.', {
    cwd: string('Repository path; defaults to server cwd.'), snapshotId: string('Snapshot id from changes_begin.', undefined, true), maxChars: number('Maximum diff characters.', 120000),
  }),
  tool('changes_snapshots', 'List task baselines stored in this repository.', { cwd: string('Repository path; defaults to server cwd.') }),
]

const prompts = [
  {
    name: 'review-changes',
    description: 'Review current repository changes and produce an evidence-backed report.',
    arguments: [
      { name: 'cwd', description: 'Repository path. Use the active workspace when omitted.', required: false },
      { name: 'focus', description: 'Optional review focus, such as security, correctness, or performance.', required: false },
    ],
  },
  {
    name: 'begin-change-task',
    description: 'Start an implementation task with a baseline for task-scoped change review.',
    arguments: [
      { name: 'cwd', description: 'Repository path. Use the active workspace when omitted.', required: false },
      { name: 'label', description: 'Short task label.', required: false },
    ],
  },
]

export async function runMcp() {
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (chunk) => {
    buffer += chunk
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n')
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      try { await handle(JSON.parse(line)) } catch (error) { process.stderr.write(`${error?.stack ?? error}\n`) }
    }
  })
  process.stdin.resume()
}

async function handle(message) {
  if (!('id' in message)) return
  if (message.method === 'initialize') return reply(message.id, {
    protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
    capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
    serverInfo: { name: 'universal-change-review', version: '0.2.0' },
  })
  if (message.method === 'tools/list') return reply(message.id, { tools })
  if (message.method === 'prompts/list') return reply(message.id, { prompts })
  if (message.method === 'prompts/get') {
    try { return reply(message.id, getPrompt(message.params?.name, message.params?.arguments ?? {})) }
    catch (error) { return failure(message.id, -32602, String(error?.message ?? error)) }
  }
  if (message.method === 'tools/call') {
    try {
      const result = callTool(message.params?.name, message.params?.arguments ?? {})
      return reply(message.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result })
    } catch (error) {
      return reply(message.id, { content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true })
    }
  }
  return failure(message.id, -32601, `Method not found: ${message.method}`)
}

function getPrompt(name, args) {
  const cwd = args.cwd ? ` Use repository: ${args.cwd}.` : ''
  if (name === 'begin-change-task') {
    const label = args.label ? ` Label the baseline: ${args.label}.` : ''
    return { description: 'Create a task baseline before implementation.', messages: [{ role: 'user', content: { type: 'text', text: `Before editing code, call changes_begin and retain the snapshot id for this task.${cwd}${label} Then inspect the repository and implement the requested change.` } }] }
  }
  if (name === 'review-changes') {
    const focus = args.focus ? ` Pay special attention to ${args.focus}.` : ''
    return { description: 'Review current changes with evidence and severity.', messages: [{ role: 'user', content: { type: 'text', text: `Review the current code changes.${cwd}${focus} Call changes_summary first, then inspect relevant files with changes_diff. If a task snapshot id is available, call changes_since to separate task changes from pre-existing work. Report findings first, ordered by severity, with file and line evidence. Then report changed behavior, validation performed, and remaining risks. Do not modify files unless explicitly asked to fix a finding.` } }] }
  }
  throw new Error(`Unknown prompt: ${name}`)
}

function callTool(name, args) {
  const cwd = args.cwd || process.cwd()
  if (name === 'changes_summary') return workingSummary(cwd, args.scope || 'all')
  if (name === 'changes_diff') return workingDiff(cwd, args)
  if (name === 'changes_begin') return beginSnapshot(cwd, args.label || 'task')
  if (name === 'changes_since') return diffSince(cwd, args.snapshotId, args.maxChars)
  if (name === 'changes_snapshots') return listSnapshots(cwd)
  throw new Error(`Unknown tool: ${name}`)
}

function reply(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`) }
function failure(id, code, message) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`) }
function tool(name, description, rawProperties) {
  const required = Object.entries(rawProperties).filter(([, value]) => value.__required).map(([key]) => key)
  const properties = Object.fromEntries(Object.entries(rawProperties).map(([key, value]) => {
    const { __required, ...schema } = value
    return [key, schema]
  }))
  return { name, description, inputSchema: { type: 'object', properties, additionalProperties: false, required } }
}
function string(description, defaultValue, required = false) { return { type: 'string', description, ...(defaultValue === undefined ? {} : { default: defaultValue }), __required: required } }
function number(description, defaultValue) { return { type: 'number', description, default: defaultValue } }
function enumValue(values, defaultValue) { return { type: 'string', enum: values, default: defaultValue } }

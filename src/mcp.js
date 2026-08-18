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
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'universal-change-review', version: '0.1.0' },
  })
  if (message.method === 'tools/list') return reply(message.id, { tools })
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

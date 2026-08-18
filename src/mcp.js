import { beginSnapshot, diffSince, listSnapshots, workingDiff, workingSummary } from './git.js'
import { openPanel } from './panel.js'

const PANEL_RESOURCE_URI = 'ui://universal-change-review/launcher-v1.html'

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
  tool('changes_open_panel', 'Start a local read-only Changes panel with live file and diff updates. Returns a localhost URL and, on MCP Apps hosts, a clickable launcher card.', {
    cwd: string('Repository path; defaults to server cwd.'), port: number('Optional local port; uses a random available port by default.'),
  }, {
    ui: { resourceUri: PANEL_RESOURCE_URI },
    'openai/outputTemplate': PANEL_RESOURCE_URI,
    'openai/toolInvocation/invoking': 'Opening Changes…',
    'openai/toolInvocation/invoked': 'Changes panel ready.',
  }),
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
    capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
    serverInfo: { name: 'universal-change-review', version: '0.4.0' },
  })
  if (message.method === 'tools/list') return reply(message.id, { tools })
  if (message.method === 'resources/list') return reply(message.id, { resources: [{
    uri: PANEL_RESOURCE_URI,
    name: 'Universal Change Review launcher',
    description: 'Clickable launcher for the live read-only Changes panel.',
    mimeType: 'text/html;profile=mcp-app',
  }] })
  if (message.method === 'resources/read') {
    if (message.params?.uri !== PANEL_RESOURCE_URI) return failure(message.id, -32602, `Unknown resource: ${message.params?.uri}`)
    return reply(message.id, { contents: [{
      uri: PANEL_RESOURCE_URI,
      mimeType: 'text/html;profile=mcp-app',
      text: panelLauncherHtml(),
      _meta: { ui: { prefersBorder: true } },
    }] })
  }
  if (message.method === 'prompts/list') return reply(message.id, { prompts })
  if (message.method === 'prompts/get') {
    try { return reply(message.id, getPrompt(message.params?.name, message.params?.arguments ?? {})) }
    catch (error) { return failure(message.id, -32602, String(error?.message ?? error)) }
  }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {})
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
    return { description: 'Review current changes with evidence and severity.', messages: [{ role: 'user', content: { type: 'text', text: `Review the current code changes.${cwd}${focus} Call changes_open_panel and provide its localhost URL for visual inspection. Call changes_summary, then inspect relevant files with changes_diff. If a task snapshot id is available, call changes_since to separate task changes from pre-existing work. Report findings first, ordered by severity, with file and line evidence. Then report changed behavior, validation performed, and remaining risks. Do not modify files unless explicitly asked to fix a finding.` } }] }
  }
  throw new Error(`Unknown prompt: ${name}`)
}

async function callTool(name, args) {
  const cwd = args.cwd || process.cwd()
  if (name === 'changes_summary') return workingSummary(cwd, args.scope || 'all')
  if (name === 'changes_diff') return workingDiff(cwd, args)
  if (name === 'changes_begin') return beginSnapshot(cwd, args.label || 'task')
  if (name === 'changes_since') return diffSince(cwd, args.snapshotId, args.maxChars)
  if (name === 'changes_snapshots') return listSnapshots(cwd)
  if (name === 'changes_open_panel') {
    const panel = await openPanel(cwd, { port: args.port })
    const summary = workingSummary(cwd, 'all')
    return { ...panel, changedFiles: summary.files.length, additions: sum(summary.files, 'added'), deletions: sum(summary.files, 'deleted') }
  }
  throw new Error(`Unknown tool: ${name}`)
}

function reply(id, result) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`) }
function failure(id, code, message) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`) }
function tool(name, description, rawProperties, meta) {
  const required = Object.entries(rawProperties).filter(([, value]) => value.__required).map(([key]) => key)
  const properties = Object.fromEntries(Object.entries(rawProperties).map(([key, value]) => {
    const { __required, ...schema } = value
    return [key, schema]
  }))
  return { name, description, inputSchema: { type: 'object', properties, additionalProperties: false, required }, ...(meta ? { _meta: meta } : {}) }
}
function string(description, defaultValue, required = false) { return { type: 'string', description, ...(defaultValue === undefined ? {} : { default: defaultValue }), __required: required } }
function number(description, defaultValue) { return { type: 'number', description, default: defaultValue } }
function enumValue(values, defaultValue) { return { type: 'string', enum: values, default: defaultValue } }

function sum(files, field) {
  return files.reduce((total, file) => total + (Number(file[field]) || 0), 0)
}

function panelLauncherHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark}body{margin:0;padding:12px;font:14px ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;padding:16px;background:color-mix(in srgb,Canvas 96%,currentColor 4%)}.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.title{font-weight:750;font-size:15px}.badge{font-size:12px;color:#2d8a55;background:#dff7e8;border-radius:99px;padding:4px 8px}.root{margin:10px 0;color:color-mix(in srgb,currentColor 62%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stats{display:flex;gap:12px;margin:12px 0}.add{color:#16833e}.del{color:#c63845}a{display:block;text-align:center;text-decoration:none;border-radius:8px;padding:10px;background:#2563eb;color:white;font-weight:700}.note{font-size:12px;margin-top:10px;color:color-mix(in srgb,currentColor 58%,transparent)}</style></head><body><div class="card"><div class="top"><div class="title">Universal Change Review</div><div class="badge">Read-only</div></div><div class="root" id="root">Preparing workspace…</div><div class="stats"><span id="files">0 files</span><span class="add" id="add">+0</span><span class="del" id="del">-0</span></div><a id="open" href="#" target="_blank" rel="noreferrer">Open Changes</a><div class="note">Live local panel · available while this MCP session is running</div></div><script>
  const root=document.getElementById('root'),files=document.getElementById('files'),add=document.getElementById('add'),del=document.getElementById('del'),open=document.getElementById('open');
  function render(value){if(!value)return;root.textContent=value.root||'Workspace';files.textContent=(value.changedFiles??0)+' files';add.textContent='+'+(value.additions??0);del.textContent='-'+(value.deletions??0);if(value.url){open.href=value.url;open.removeAttribute('aria-disabled')}}
  render(globalThis.openai?.toolOutput);
  window.addEventListener('message',event=>{if(event.source!==window.parent)return;const message=event.data;if(message?.jsonrpc==='2.0'&&message.method==='ui/notifications/tool-result')render(message.params?.structuredContent)},{passive:true});
  </script></body></html>`
}

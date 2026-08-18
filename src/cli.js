import { beginSnapshot, diffSince, listSnapshots, workingDiff, workingSummary } from './git.js'
import { runMcp } from './mcp.js'

export async function runCli(argv) {
  const command = argv[0] || 'help'
  const options = parse(argv.slice(1))
  if (command === 'mcp') return runMcp()
  if (command === 'summary') return print(workingSummary(options.cwd, options.scope || 'all'), options.json)
  if (command === 'diff') return print(workingDiff(options.cwd, { scope: options.scope || 'all', file: options.file, maxChars: options.maxChars }), options.json)
  if (command === 'begin') return print(beginSnapshot(options.cwd, options.label || 'task'), options.json)
  if (command === 'since') return print(diffSince(options.cwd, options.id, options.maxChars), options.json)
  if (command === 'snapshots') return print(listSnapshots(options.cwd), options.json)
  process.stdout.write(`Universal Change Review\n\nCommands:\n  summary [--scope all|staged|unstaged]\n  diff [--scope ...] [--file path]\n  begin [--label text]\n  since --id snapshot-id\n  snapshots\n  mcp\n\nOptions:\n  --cwd path  --json  --max-chars number\n`)
}

function parse(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--json') result.json = true
    else if (arg.startsWith('--')) result[toCamel(arg.slice(2))] = args[++i]
  }
  return result
}

function toCamel(value) { return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) }
function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  else if (typeof value.diff === 'string') process.stdout.write(value.diff || '(no changes)\n')
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

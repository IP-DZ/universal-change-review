const vscode = require('vscode')
const { pathToFileURL } = require('url')
const path = require('path')

let panelModule
let activeRoot
let activeUrl
let launcher

async function activate(context) {
  launcher = new LauncherProvider(context)
  const statusEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusEntry.name = 'Universal Change Review'
  statusEntry.text = '$(diff) Changes Review'
  statusEntry.tooltip = 'Open the live read-only Changes panel'
  statusEntry.command = 'universalChangeReview.open'
  statusEntry.show()
  context.subscriptions.push(
    statusEntry,
    vscode.window.registerWebviewViewProvider('universalChangeReview.launcher', launcher),
    vscode.commands.registerCommand('universalChangeReview.open', () => openChanges(context, true)),
    vscode.commands.registerCommand('universalChangeReview.refresh', () => openChanges(context, true)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => launcher.update()),
  )
}

async function deactivate() {
  if (panelModule && activeRoot) await panelModule.closePanel(activeRoot).catch(() => {})
}

class LauncherProvider {
  constructor(context) {
    this.context = context
  }

  resolveWebviewView(view) {
    this.view = view
    view.webview.options = { enableScripts: true }
    view.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'open') openChanges(this.context, true)
    })
    this.update()
    openChanges(this.context, false)
  }

  update(status) {
    if (!this.view) return
    const root = workspaceRoot()
    this.view.description = root ? path.basename(root) : 'No workspace'
    this.view.webview.html = launcherHtml(root, status)
  }
}

async function openChanges(context, focus) {
  const root = workspaceRoot()
  if (!root) {
    launcher?.update('Open a folder or Git repository first.')
    if (focus) vscode.window.showInformationMessage('Open a folder before opening Changes Review.')
    return
  }
  try {
    launcher?.update('Starting the read-only Changes panel…')
    if (!panelModule) {
      const modulePath = path.join(context.extensionPath, 'server', 'src', 'panel.js')
      panelModule = await import(pathToFileURL(modulePath).href)
    }
    if (activeRoot && activeRoot !== root) await panelModule.closePanel(activeRoot).catch(() => {})
    const panel = await panelModule.openPanel(root)
    activeRoot = root
    activeUrl = panel.url
    launcher?.update('Live panel ready · read-only')
    await vscode.commands.executeCommand('simpleBrowser.show', activeUrl)
  } catch (error) {
    const message = `Unable to open Changes Review: ${error?.message ?? error}`
    launcher?.update(message)
    if (focus) vscode.window.showErrorMessage(message)
  }
}

function workspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

function launcherHtml(root, status) {
  const safeRoot = escapeHtml(root || 'Open a folder to review its changes.')
  const safeStatus = escapeHtml(status || 'Click the activity-bar icon to open Changes in an editor tab.')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{padding:16px;color:var(--vscode-foreground);font:13px var(--vscode-font-family)}.card{border:1px solid var(--vscode-widget-border);border-radius:8px;padding:14px;background:var(--vscode-sideBar-background)}h2{font-size:14px;margin:0 0 8px}.root{color:var(--vscode-descriptionForeground);word-break:break-all;margin-bottom:14px}.status{margin:12px 0;color:var(--vscode-descriptionForeground)}button{width:100%;border:0;border-radius:5px;padding:8px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.safe{margin-top:12px;font-size:12px;color:var(--vscode-descriptionForeground)}
  </style></head><body><div class="card"><h2>Universal Change Review</h2><div class="root">${safeRoot}</div><button id="open">Open Changes</button><div class="status">${safeStatus}</div><div class="safe">Local · live · read-only</div></div><script>const vscode=acquireVsCodeApi();document.getElementById('open').onclick=()=>vscode.postMessage({type:'open'});</script></body></html>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

module.exports = { activate, deactivate }

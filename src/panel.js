import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { repository, workingDiff, workingSummary, diffSince, listSnapshots } from './git.js'

const panels = new Map()

export async function openPanel(cwd = process.cwd(), options = {}) {
  const repo = repository(cwd)
  const existing = panels.get(repo.root)
  if (existing) return existing.info

  const token = randomBytes(24).toString('hex')
  const clients = new Set()
  const server = createServer((request, response) => route({ request, response, repo, token, clients }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(options.port) || 0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}/?token=${token}`
  const timer = setInterval(() => {
    for (const client of clients) client.write('event: refresh\ndata: {}\n\n')
  }, 1500)
  timer.unref()
  const info = { root: repo.root, url, host: '127.0.0.1', port: address.port, readOnly: true }
  panels.set(repo.root, { info, server, timer })
  server.on('close', () => { clearInterval(timer); panels.delete(repo.root) })
  return info
}

export async function closePanel(cwd = process.cwd()) {
  const root = repository(cwd).root
  const panel = panels.get(root)
  if (!panel) return false
  await new Promise((resolve, reject) => panel.server.close((error) => error ? reject(error) : resolve()))
  return true
}

async function route({ request, response, repo, token, clients }) {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.searchParams.get('token') !== token) return send(response, 403, 'text/plain; charset=utf-8', 'Forbidden')
    if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', panelHtml(repo.root, token))
    if (url.pathname === '/events') return events(request, response, clients)
    if (url.pathname === '/api/state') return json(response, state(repo.root, url.searchParams))
    if (url.pathname === '/api/diff') return json(response, fileDiff(repo.root, url.searchParams))
    return send(response, 404, 'text/plain; charset=utf-8', 'Not found')
  } catch (error) {
    return json(response, { error: String(error?.message ?? error) }, 500)
  }
}

function state(root, params) {
  const snapshotId = params.get('snapshotId')
  const scope = params.get('scope') || 'all'
  const result = snapshotId ? diffSince(root, snapshotId, 1000) : workingSummary(root, scope)
  return { ...result, snapshots: listSnapshots(root).snapshots }
}

function fileDiff(root, params) {
  const file = params.get('file')
  if (!file) throw new Error('file is required')
  const snapshotId = params.get('snapshotId')
  if (snapshotId) {
    const result = diffSince(root, snapshotId, 1000000)
    return { root, file, scope: 'task', diff: extractFilePatch(result.diff, file), truncated: result.truncated }
  }
  return workingDiff(root, { scope: params.get('scope') || 'all', file, maxChars: 1000000 })
}

function extractFilePatch(diff, file) {
  const markers = [`diff --git a/${file} b/${file}`, `diff --git a/${file} /dev/null`, `diff --git /dev/null b/${file}`]
  const start = markers.map((marker) => diff.indexOf(marker)).filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (start === undefined) return ''
  const next = diff.indexOf('\ndiff --git ', start + 1)
  return diff.slice(start, next < 0 ? undefined : next)
}

function events(request, response, clients) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff',
  })
  response.write('event: ready\ndata: {}\n\n')
  clients.add(response)
  request.on('close', () => clients.delete(response))
}

function json(response, value, status = 200) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(value), {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
}

function send(response, status, type, body, headers = {}) {
  response.writeHead(status, { 'content-type': type, ...headers })
  response.end(body)
}

function panelHtml(root, token) {
  const rootJson = JSON.stringify(root).replaceAll('<', '\\u003c')
  const tokenJson = JSON.stringify(token)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Universal Change Review</title>
<style>
:root{color-scheme:dark;--bg:#0b0e14;--panel:#121722;--line:#263043;--muted:#8b98ad;--text:#e8edf5;--blue:#63a4ff;--green:#46c37b;--red:#ff6b78;--orange:#ffb454}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;height:100vh;overflow:hidden}header{height:66px;display:flex;align-items:center;gap:18px;padding:0 22px;border-bottom:1px solid var(--line);background:#0e131d}.brand{font-weight:750;font-size:15px;white-space:nowrap}.root{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.live{display:flex;align-items:center;gap:7px;color:var(--muted)}.dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 9px var(--green)}main{height:calc(100vh - 66px);display:grid;grid-template-columns:minmax(240px,330px) 1fr}.sidebar{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-width:0}.toolbar{padding:14px;border-bottom:1px solid var(--line);display:flex;gap:7px;flex-wrap:wrap}button,select{border:1px solid var(--line);background:#171e2b;color:var(--text);border-radius:7px;padding:7px 10px;font:inherit}button{cursor:pointer}button.active{border-color:var(--blue);color:var(--blue);background:#14233a}.summary{padding:11px 14px;color:var(--muted);border-bottom:1px solid var(--line)}.files{overflow:auto;flex:1}.file{display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px 14px;border-bottom:1px solid #1b2331;cursor:pointer}.file:hover,.file.active{background:#182131}.path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.counts{font-variant-numeric:tabular-nums}.add{color:var(--green)}.del{color:var(--red)}.empty{padding:32px 18px;color:var(--muted);text-align:center}.content{min-width:0;display:flex;flex-direction:column}.filehead{height:48px;padding:0 18px;display:flex;align-items:center;border-bottom:1px solid var(--line);font-weight:650}.diff{overflow:auto;flex:1;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.row{display:grid;grid-template-columns:54px 54px 22px minmax(max-content,1fr);min-height:20px}.row.added{background:#10271c}.row.removed{background:#30171c}.row.meta{background:#142033;color:#94baff}.ln{color:#66758d;text-align:right;padding-right:10px;user-select:none;border-right:1px solid #243044}.mark{text-align:center;color:#8290a5}.code{white-space:pre;padding:0 12px}.placeholder{margin:auto;color:var(--muted);font-size:14px}.error{color:var(--red);padding:20px}@media(max-width:720px){header{height:58px;padding:0 12px}.root{display:none}main{height:calc(100vh - 58px);grid-template-columns:42% 58%}.toolbar{padding:9px}.file{padding:9px}.row{grid-template-columns:38px 38px 16px minmax(max-content,1fr)}}
</style></head><body>
<header><div class="brand">Universal Change Review</div><div class="root" id="root"></div><div class="live"><span class="dot"></span><span>Live · read-only</span></div></header>
<main><aside class="sidebar"><div class="toolbar"><button data-scope="all" class="active">All</button><button data-scope="unstaged">Unstaged</button><button data-scope="staged">Staged</button><select id="snapshot"><option value="">Current workspace</option></select></div><div class="summary" id="summary">Loading…</div><div class="files" id="files"></div></aside><section class="content"><div class="filehead" id="filehead">Select a changed file</div><div class="diff" id="diff"><div class="placeholder">Changes will appear here as files are edited.</div></div></section></main>
<script>
const TOKEN=${tokenJson}, ROOT=${rootJson};let scope='all',snapshotId='',selected='',signature='';
const $=id=>document.getElementById(id);$('root').textContent=ROOT;
const api=(path,params={})=>{const q=new URLSearchParams({token:TOKEN,...params});return fetch(path+'?'+q).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error||r.statusText);return v})};
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;snapshotId='';$('snapshot').value='';document.querySelectorAll('[data-scope]').forEach(x=>x.classList.toggle('active',x===b));refresh(true)});
$('snapshot').onchange=e=>{snapshotId=e.target.value;document.querySelectorAll('[data-scope]').forEach(x=>x.classList.remove('active'));refresh(true)};
async function refresh(force=false){try{const state=await api('/api/state',snapshotId?{snapshotId}:{scope});const next=JSON.stringify([state.status,state.files,state.snapshot?.id]);if(!force&&next===signature)return;signature=next;renderState(state);if(selected&&!state.files.some(f=>f.path===selected))selected='';if(selected)await loadDiff(selected);else clearDiff()}catch(e){$('summary').textContent='Unable to read changes';$('files').innerHTML='<div class="error"></div>';$('files').firstChild.textContent=e.message}}
function renderState(state){const files=state.files||[];const adds=files.reduce((n,f)=>n+(f.added||0),0),dels=files.reduce((n,f)=>n+(f.deleted||0),0);$('summary').textContent=files.length+' files · +'+adds+' / -'+dels;const select=$('snapshot'),current=select.value;select.innerHTML='<option value="">Current workspace</option>';for(const s of [...(state.snapshots||[])].reverse()){const o=document.createElement('option');o.value=s.id;o.textContent='Task: '+s.label;select.append(o)}select.value=current;const box=$('files');box.textContent='';if(!files.length){box.innerHTML='<div class="empty">No changes in this scope</div>';clearDiff();return}for(const f of files){const item=document.createElement('div');item.className='file'+(f.path===selected?' active':'');const path=document.createElement('div');path.className='path';path.textContent=f.path;path.title=f.path;const counts=document.createElement('div');counts.className='counts';counts.innerHTML='<span class="add">+'+(f.added??'–')+'</span> <span class="del">-'+(f.deleted??'–')+'</span>';item.append(path,counts);item.onclick=()=>loadDiff(f.path);box.append(item)}}
async function loadDiff(file){selected=file;$('filehead').textContent=file;document.querySelectorAll('.file').forEach((el,i)=>el.classList.toggle('active',el.querySelector('.path')?.textContent===file));$('diff').innerHTML='<div class="placeholder">Loading diff…</div>';try{const result=await api('/api/diff',snapshotId?{snapshotId,file}:{scope,file});renderDiff(result.diff||'')}catch(e){$('diff').textContent=e.message}}
function clearDiff(){$('filehead').textContent='Select a changed file';$('diff').innerHTML='<div class="placeholder">Changes will appear here as files are edited.</div>'}
function renderDiff(text){const box=$('diff');box.textContent='';if(!text){box.innerHTML='<div class="placeholder">No textual diff for this file.</div>';return}let oldN=0,newN=0,inHunk=false;for(const line of text.split('\\n')){let cls='',mark=' ',old='',neu='';if(line.startsWith('@@')){const m=line.match(/@@ -(\\d+)(?:,\\d+)? \\+(\\d+)/);if(m){oldN=+m[1];newN=+m[2]}inHunk=true;cls='meta';mark='@'}else if(!inHunk){cls='meta'}else if(line.startsWith('+')&&!line.startsWith('+++')){cls='added';neu=newN++;mark='+'}else if(line.startsWith('-')&&!line.startsWith('---')){cls='removed';old=oldN++;mark='-'}else{old=oldN++;neu=newN++}const row=document.createElement('div');row.className='row '+cls;for(const [value,kind] of [[old,'ln'],[neu,'ln'],[mark,'mark'],[line,'code']]){const cell=document.createElement('div');cell.className=kind;cell.textContent=value;row.append(cell)}box.append(row)}}
const events=new EventSource('/events?token='+encodeURIComponent(TOKEN));events.addEventListener('refresh',()=>refresh());events.onerror=()=>document.querySelector('.dot').style.background='var(--orange)';events.onopen=()=>document.querySelector('.dot').style.background='var(--green)';refresh(true);
</script></body></html>`
}

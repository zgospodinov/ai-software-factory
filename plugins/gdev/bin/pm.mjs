#!/usr/bin/env node
// pm.mjs — zero-dependency CLI for the "pm" Claude Code plugin.
// Single source of truth: .pm/board.json (index) + .pm/items/<ID>.md (details, loaded on demand).
// Every command prints compact output so an AI agent spends as few tokens as possible.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const VERSION = '0.2.4'
const STATUSES = ['idea', 'backlog', 'ready', 'doing', 'review', 'done', 'dropped']
const OPEN = ['backlog', 'ready', 'doing', 'review']
const TYPES = ['epic', 'story', 'bug', 'spike', 'chore']
const PRIOS = ['P0', 'P1', 'P2', 'P3']
const SEVERITY_TO_PRIO = { S1: 'P0', S2: 'P1', S3: 'P2', S4: 'P3' }
const HORIZONS = ['now', 'next', 'later', 'shipped']
const FIB = [1, 2, 3, 5, 8, 13, 21]
const SELF = fileURLToPath(import.meta.url)
const TEMPLATES = path.join(path.dirname(SELF), '..', 'templates')

// ---------- io helpers ----------
const today = () => new Date().toISOString().slice(0, 10)
const die = (msg, code = 1) => { process.stderr.write(`pm: ${msg}\n`); process.exit(code) }
const out = (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n')

function findRoot(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.pm', 'board.json'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

class Store {
  constructor(root) {
    this.root = root
    this.dir = path.join(root, '.pm')
    this.boardFile = path.join(this.dir, 'board.json')
    this.cfgFile = path.join(this.dir, 'config.json')
    this.board = JSON.parse(fs.readFileSync(this.boardFile, 'utf8'))
    this.cfg = JSON.parse(fs.readFileSync(this.cfgFile, 'utf8'))
    this.board.roadmap ??= []
    this.board.sprints ??= []
    this.board.meta ??= {}
  }
  save() {
    this.board.meta.updated = new Date().toISOString()
    writeAtomic(this.boardFile, JSON.stringify(this.board, null, 1) + '\n')
  }
  get key() { return this.cfg.key }
  item(id) {
    const want = normId(id, this.key)
    const it = this.board.items.find((i) => i.id === want)
    if (!it) die(`no item ${want}`)
    return it
  }
  nextId() {
    this.board.meta.seq = (this.board.meta.seq ?? 0) + 1
    return `${this.key}-${this.board.meta.seq}`
  }
  itemFile(id) { return path.join(this.dir, 'items', `${id}.md`) }
  activeSprint() { return this.board.sprints.find((s) => s.status === 'active') }
  log(line) {
    const f = path.join(this.dir, 'log.md')
    fs.appendFileSync(f, `- ${today()} ${line}\n`)
    rotateLog(this.dir, f, this.cfg.logMaxLines ?? 300)
  }
}

function rotateLog(dir, f, max) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  if (lines.length <= max) return
  const cut = lines.length - Math.floor(max / 2)
  const archive = path.join(dir, 'archive', `log-${today().slice(0, 7)}.md`)
  fs.mkdirSync(path.dirname(archive), { recursive: true })
  fs.appendFileSync(archive, lines.slice(0, cut).join('\n') + '\n')
  writeAtomic(f, `<!-- older entries: .pm/archive/ -->\n${lines.slice(cut).join('\n')}`)
}

const normId = (id, key) => {
  const s = String(id).toUpperCase()
  return /^\d+$/.test(s) ? `${key}-${s}` : s
}

function parseArgs(argv) {
  const pos = []
  const opt = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      if (v !== undefined) opt[k] = v
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opt[k] = argv[++i]
      else opt[k] = true
    } else pos.push(a)
  }
  return { pos, opt }
}

function store() {
  const root = findRoot()
  if (!root) die('no .pm/ found here or above — run the /gdev:setup skill (or `pm init`) first', 2)
  return new Store(root)
}

// ---------- templates ----------
function template(type, vars) {
  const f = path.join(TEMPLATES, `${type}.md`)
  let t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `# {{id}} {{title}}\n\n## Notes\n- \n`
  for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{{${k}}}`, v ?? '')
  return t
}

// ---------- formatting ----------
const pad = (s, n) => String(s ?? '').padEnd(n)
function row(i) {
  const pts = i.points != null ? `${i.points}p` : '-'
  const flags = [i.blocked ? `BLOCKED(${i.blocked})` : '', i.severity ?? ''].filter(Boolean).join(' ')
  return `${pad(i.id, 9)}${pad(i.type, 6)}${pad(i.status, 8)}${pad(i.prio, 3)}${pad(pts, 4)}${pad(i.epic ?? '', 9)}${i.title}${flags ? '  ' + flags : ''}`
}
const sortItems = (a, b) =>
  STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
  PRIOS.indexOf(a.prio) - PRIOS.indexOf(b.prio) ||
  (a.rank ?? 1e9) - (b.rank ?? 1e9) ||
  Number(a.id.split('-').pop()) - Number(b.id.split('-').pop())

function sprintStats(s, items) {
  const its = items.filter((i) => i.sprint === s.id && i.type !== 'epic' && i.status !== 'dropped')
  const total = its.reduce((n, i) => n + (i.points ?? 0), 0)
  const done = its.filter((i) => i.status === 'done').reduce((n, i) => n + (i.points ?? 0), 0)
  return { its, total, done }
}

// ---------- DoR check (deterministic grooming lint) ----------
function dorProblems(st, it) {
  const p = []
  if (it.type === 'epic') {
    const kids = st.board.items.filter((i) => i.epic === it.id)
    if (!kids.length) p.push('epic has no stories')
    return p
  }
  if (it.points == null && it.type !== 'spike') p.push('no estimate')
  if (it.points > (st.cfg.maxPoints ?? 8)) p.push(`too big (${it.points}p > ${st.cfg.maxPoints ?? 8}) — split`)
  if (it.type === 'story' && !it.epic) p.push('no epic')
  if (it.blocked) p.push(`blocked: ${it.blocked}`)
  const f = st.itemFile(it.id)
  if (!fs.existsSync(f)) { p.push('no item file'); return p }
  const md = fs.readFileSync(f, 'utf8')
  const sec = (name) => (md.split(new RegExp(`^## ${name}.*$`, 'mi'))[1] ?? '').split(/^## /m)[0]
  if (it.type === 'story' && /As a <|As an? \.\.\./i.test(sec('Story'))) p.push('story statement is a placeholder')
  if (it.type === 'bug') {
    if (!/\d\.\s+\S/.test(sec('Steps to reproduce'))) p.push('no repro steps')
    if (!sec('Expected').trim() || !sec('Actual').trim()) p.push('expected/actual missing')
  }
  if (it.type !== 'spike') {
    const ac = sec('Acceptance criteria')
    if (!/given.+when.+then|given[\s\S]+then/i.test(ac) && !/- \[ \] \S{3,}/.test(ac)) p.push('no testable acceptance criteria')
    else if (/<(context|action|observable result)>/.test(ac)) p.push('acceptance criteria are placeholders')
  } else if (!/\S{5,}/.test(sec('Question'))) p.push('spike has no question/timebox')
  if (/^\s*-\s*Q:/m.test(md)) p.push('open questions (Q:) remain')
  return p
}

// ---------- commands ----------
const cmds = {}

cmds.help = () => out(`pm ${VERSION} — commands (ID may be "12" or "KEY-12"):
 init --name N --key KEY [--sprint-days 14] [--capacity 10] [--wip 2] [--max-points 8]
 add <epic|story|bug|spike|chore> "title" [--epic ID] [--points N] [--prio P0-3] [--severity S1-4] [--status S] [--horizon now|next|later]
 set <ID> key=value...      (status prio points epic sprint title rank blocked severity horizon; value "-" clears)
 move <ID> <status>          start <ID> (→doing, prints branch)   block <ID> "reason"   unblock <ID>
 ls [--status s,s] [--type t] [--epic ID] [--sprint ID|current] [--open] [--all]
 show <ID>   path <ID>   check [ID|--sprint current|--all]   next
 status      board (json for UIs)   tree (epics → children)
 roadmap [ls|add "title" --horizon now|next|later [--epic ID] [--goal "..."]|set <R-n> key=value|rm <R-n>]
 sprint [ls|new --goal "..." [--days N]|add <ID...>|rm <ID...>|start|close|plan]
 sync [--review] [--done] [--force]  pr <number>   log "text"   doctor   version`)

cmds.version = () => out(VERSION)

cmds.init = ({ opt }) => {
  const root = process.cwd()
  const dir = path.join(root, '.pm')
  if (fs.existsSync(path.join(dir, 'board.json')) && !opt.force) die('.pm/ already exists (use --force to reset config only)')
  const key = String(opt.key ?? '').toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,6}$/.test(key)) die('--key must be 2-7 chars, letters/digits, e.g. ASF')
  const cfg = {
    version: 1,
    name: opt.name ?? path.basename(root),
    key,
    sprintDays: Number(opt['sprint-days'] ?? 14),
    capacity: Number(opt.capacity ?? 10),
    wip: Number(opt.wip ?? 2),
    maxPoints: Number(opt['max-points'] ?? 8),
    doneOnMerge: true,
    branchPattern: '{type}/{id}-{slug}',
    logMaxLines: 300,
    dor: ['story statement (who/what/why)', 'testable acceptance criteria', 'estimate <= maxPoints', 'no open questions', 'dependencies known'],
    dod: ['AC verified', 'tests added/updated and green', 'self-review of diff done', 'docs/CHANGELOG updated if user-facing', 'merged to main'],
  }
  writeAtomic(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n')
  if (!fs.existsSync(path.join(dir, 'board.json'))) {
    writeAtomic(path.join(dir, 'board.json'), JSON.stringify({ version: 1, meta: { seq: 0, rseq: 0, created: today() }, roadmap: [], sprints: [], items: [] }, null, 1) + '\n')
    fs.mkdirSync(path.join(dir, 'items'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'log.md'), `# ${cfg.name} — activity log (append-only, auto-rotated)\n`)
    if (!fs.existsSync(path.join(dir, 'product.md'))) fs.writeFileSync(path.join(dir, 'product.md'), template('product', { name: cfg.name }))
  }
  // keep a project-local copy of the CLI so hooks, the UI and the agent never need the plugin path
  fs.copyFileSync(SELF, path.join(dir, 'pm.mjs'))
  fs.cpSync(TEMPLATES, path.join(dir, 'templates'), { recursive: true })
  out(`initialised .pm/ for ${cfg.name} (key ${key})`)
}

cmds.add = ({ pos, opt }) => {
  const st = store()
  const [type, ...rest] = pos
  if (!TYPES.includes(type)) die(`type must be one of ${TYPES.join('|')}`)
  const title = rest.join(' ').trim()
  if (!title) die('title required')
  const sev = opt.severity ? String(opt.severity).toUpperCase() : undefined
  if (sev && !SEVERITY_TO_PRIO[sev]) die('severity must be S1..S4')
  const it = {
    id: st.nextId(),
    type,
    title,
    status: opt.status ?? (type === 'epic' ? 'backlog' : type === 'bug' ? 'backlog' : 'backlog'),
    prio: String(opt.prio ?? (sev ? SEVERITY_TO_PRIO[sev] : 'P2')).toUpperCase(),
    points: opt.points != null ? Number(opt.points) : undefined,
    epic: opt.epic ? normId(opt.epic, st.key) : undefined,
    severity: sev,
    horizon: opt.horizon,
    created: today(),
    updated: today(),
  }
  if (!STATUSES.includes(it.status)) die(`bad status ${it.status}`)
  if (!PRIOS.includes(it.prio)) die(`bad prio ${it.prio}`)
  if (it.epic) st.item(it.epic)
  st.board.items.push(it)
  const file = st.itemFile(it.id)
  if (!fs.existsSync(file)) {
    const tdir = fs.existsSync(path.join(st.dir, 'templates')) ? path.join(st.dir, 'templates') : TEMPLATES
    const tf = path.join(tdir, `${type}.md`)
    let t = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : template(type, {})
    for (const [k, v] of Object.entries({ id: it.id, title, epic: it.epic ?? '-', severity: sev ?? '-', date: today() })) t = t.replaceAll(`{{${k}}}`, v)
    writeAtomic(file, t)
  }
  st.save()
  st.log(`added ${it.id} [${type}] ${title}`)
  out(`${it.id} ${path.relative(st.root, file).replaceAll('\\', '/')}`)
}

function applySet(st, it, pairs) {
  const changes = []
  for (const p of pairs) {
    const eq = p.indexOf('=')
    if (eq < 1) die(`expected key=value, got "${p}"`)
    const k = p.slice(0, eq)
    let v = p.slice(eq + 1)
    const clear = v === '-' || v === ''
    switch (k) {
      case 'status': if (!STATUSES.includes(v)) die(`status must be ${STATUSES.join('|')}`); break
      case 'prio': v = v.toUpperCase(); if (!PRIOS.includes(v)) die('prio must be P0..P3'); break
      case 'points': if (!clear) { v = Number(v); if (!FIB.includes(v)) die(`points must be one of ${FIB.join(',')}`) } break
      case 'rank': v = Number(v); break
      case 'severity': v = v.toUpperCase(); if (!clear && !SEVERITY_TO_PRIO[v]) die('severity S1..S4'); break
      case 'epic': if (!clear) { v = normId(v, st.key); st.item(v) } break
      case 'sprint': if (!clear) { v = v.toUpperCase(); if (v === 'CURRENT') v = st.activeSprint()?.id ?? die('no active sprint'); if (!st.board.sprints.find((s) => s.id === v)) die(`no sprint ${v}`) } break
      case 'horizon': if (!clear && !HORIZONS.includes(v)) die(`horizon ${HORIZONS.join('|')}`); break
      case 'title': case 'blocked': break
      default: die(`unknown field ${k}`)
    }
    if (clear) delete it[k]
    else it[k] = v
    if (k === 'title') retitle(st, it)
    changes.push(`${k}=${clear ? '-' : v}`)
  }
  it.updated = today()
  return changes
}

function retitle(st, it) {
  const f = st.itemFile(it.id)
  if (!fs.existsSync(f)) return
  const md = fs.readFileSync(f, 'utf8').replace(/^# .*$/m, `# ${it.id} ${it.title}`)
  writeAtomic(f, md)
}

function wipWarn(st, it) {
  if (it.status !== 'doing') return ''
  const n = st.board.items.filter((i) => i.status === 'doing' && i.type !== 'epic').length
  return n > st.cfg.wip ? ` (WIP ${n}/${st.cfg.wip} exceeded — finish before starting)` : ''
}

cmds.set = ({ pos }) => {
  const st = store()
  const [id, ...pairs] = pos
  const it = st.item(id)
  const ch = applySet(st, it, pairs)
  if (it.status === 'done') it.doneAt ??= today()
  const ep = []
  closeEpics(st, ep)
  st.save()
  st.log(`${it.id} ${ch.join(' ')}`)
  out(`${it.id} ${ch.join(' ')}${wipWarn(st, it)}${ep.length ? ` (${ep.join(', ')})` : ''}`)
}

cmds.move = ({ pos }) => cmds.set({ pos: [pos[0], `status=${pos[1]}`] })

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'work'
cmds.start = ({ pos }) => {
  const st = store()
  const it = st.item(pos[0])
  const probs = it.type === 'chore' ? [] : dorProblems(st, it).filter((p) => !p.startsWith('blocked'))
  it.status = 'doing'
  it.updated = today()
  st.save()
  st.log(`${it.id} started`)
  const type = { story: 'feat', bug: 'fix', spike: 'spike', chore: 'chore', epic: 'feat' }[it.type]
  const branch = (st.cfg.branchPattern ?? '{type}/{id}-{slug}').replace('{type}', type).replace('{id}', it.id).replace('{slug}', slug(it.title))
  out(`${it.id} → doing${wipWarn(st, it)}\nbranch: ${branch}\nspec: .pm/items/${it.id}.md${probs.length ? `\nwarning (not ready): ${probs.join('; ')}` : ''}`)
}

cmds.block = ({ pos }) => cmds.set({ pos: [pos[0], `blocked=${pos.slice(1).join(' ') || 'yes'}`] })
cmds.unblock = ({ pos }) => cmds.set({ pos: [pos[0], 'blocked=-'] })

cmds.ls = ({ opt }) => {
  const st = store()
  let its = st.board.items
  if (!opt.all && !opt.status) its = its.filter((i) => !['done', 'dropped'].includes(i.status))
  if (opt.open) its = its.filter((i) => OPEN.includes(i.status))
  if (opt.status) { const s = String(opt.status).split(','); its = its.filter((i) => s.includes(i.status)) }
  if (opt.type) { const t = String(opt.type).split(','); its = its.filter((i) => t.includes(i.type)) }
  if (opt.epic) { const e = normId(opt.epic, st.key); its = its.filter((i) => i.epic === e || i.id === e) }
  if (opt.sprint) { const s = opt.sprint === 'current' ? st.activeSprint()?.id : String(opt.sprint).toUpperCase(); its = its.filter((i) => i.sprint === s) }
  its = [...its].sort(sortItems)
  out(its.length ? its.map(row).join('\n') : '(none)')
}

cmds.show = ({ pos }) => {
  const st = store()
  const it = st.item(pos[0])
  const f = st.itemFile(it.id)
  out(`${row(it)}${it.sprint ? `  sprint=${it.sprint}` : ''}\n---\n${fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '(no item file)'}`)
}

cmds.path = ({ pos }) => { const st = store(); out(st.itemFile(st.item(pos[0]).id)) }

cmds.check = ({ pos, opt }) => {
  const st = store()
  let its
  if (pos[0]) its = [st.item(pos[0])]
  else if (opt.sprint) { const s = opt.sprint === 'current' ? st.activeSprint()?.id : String(opt.sprint).toUpperCase(); its = st.board.items.filter((i) => i.sprint === s && i.status !== 'done') }
  else its = st.board.items.filter((i) => (opt.all ? OPEN : ['backlog', 'ready']).includes(i.status) && i.type !== 'epic')
  const lines = []
  let ok = 0
  for (const it of its) {
    const p = dorProblems(st, it)
    if (p.length) lines.push(`✗ ${it.id} ${it.title.slice(0, 50)} — ${p.join('; ')}`)
    else { ok++; if (pos[0]) lines.push(`✓ ${it.id} meets Definition of Ready`) }
  }
  out(`${lines.join('\n')}${lines.length ? '\n' : ''}DoR: ${ok}/${its.length} ready`)
}

cmds.next = () => {
  const st = store()
  const doing = st.board.items.filter((i) => i.status === 'doing')
  const sp = st.activeSprint()
  const pool = st.board.items.filter((i) => i.status === 'ready' && !i.blocked && i.type !== 'epic')
  const pick = [...pool].sort((a, b) => (sp ? (b.sprint === sp.id) - (a.sprint === sp.id) : 0) || sortItems(a, b))
  const lines = []
  if (doing.length) lines.push(`in progress: ${doing.map((i) => `${i.id} ${i.title}`).join(' | ')}`)
  if (doing.length >= st.cfg.wip) lines.push(`WIP limit ${st.cfg.wip} reached — finish one of the above first.`)
  lines.push(pick.length ? `next: ${pick.slice(0, 3).map(row).join('\n      ')}` : 'next: nothing is "ready" — run /gdev:refine')
  out(lines.join('\n'))
}

cmds.status = () => {
  const st = store()
  const its = st.board.items
  const count = (s) => its.filter((i) => i.status === s && i.type !== 'epic').length
  const sp = st.activeSprint()
  const lines = [`${st.cfg.name} [${st.key}] backlog ${count('backlog')} · ready ${count('ready')} · doing ${count('doing')} · review ${count('review')} · done ${count('done')}`]
  if (sp) {
    const { total, done } = sprintStats(sp, its)
    const left = Math.ceil((new Date(sp.end) - new Date(today())) / 864e5)
    lines.push(`sprint ${sp.id} "${sp.goal}" ${done}/${total}p · ${left}d left (ends ${sp.end})`)
  } else lines.push('no active sprint')
  const doing = its.filter((i) => ['doing', 'review'].includes(i.status) && i.type !== 'epic')
  if (doing.length) lines.push(`active: ${doing.map((i) => `${i.id}(${i.status}) ${i.title.slice(0, 40)}`).join(' | ')}`)
  const blocked = its.filter((i) => i.blocked && i.status !== 'done')
  if (blocked.length) lines.push(`blocked: ${blocked.map((i) => `${i.id} (${i.blocked})`).join(', ')}`)
  const bugs = its.filter((i) => i.type === 'bug' && OPEN.includes(i.status))
  // deferred bugs (horizon "later") are not critical-now, whatever their severity
  const crit = bugs.filter((i) => ['S1', 'S2'].includes(i.severity) && i.horizon !== 'later')
  const deferred = bugs.filter((i) => i.horizon === 'later')
  if (bugs.length) lines.push(`bugs open: ${bugs.length}${crit.length ? ` (critical: ${crit.map((i) => i.id).join(', ')})` : ''}${deferred.length ? ` (deferred: ${deferred.map((i) => i.id).join(', ')})` : ''}`)
  const now = st.board.roadmap.filter((r) => r.horizon === 'now')
  if (now.length) lines.push(`roadmap now: ${now.map((r) => r.title).join('; ')}`)
  out(lines.join('\n'))
}

cmds.board = () => {
  const st = store()
  out(JSON.stringify({ cfg: { name: st.cfg.name, key: st.key, wip: st.cfg.wip }, ...st.board }))
}

cmds.tree = () => {
  const st = store()
  const its = st.board.items
  const lines = []
  for (const e of its.filter((i) => i.type === 'epic').sort(sortItems)) {
    const kids = its.filter((i) => i.epic === e.id)
    const pts = kids.reduce((n, i) => n + (i.points ?? 0), 0)
    const dpts = kids.filter((i) => i.status === 'done').reduce((n, i) => n + (i.points ?? 0), 0)
    lines.push(`${e.id} ${e.title} [${e.status}] ${dpts}/${pts}p`)
    for (const k of kids.sort(sortItems)) lines.push(`  ${row(k)}`)
  }
  const orphans = its.filter((i) => i.type !== 'epic' && !i.epic && OPEN.includes(i.status))
  if (orphans.length) lines.push('(no epic)', ...orphans.sort(sortItems).map((i) => `  ${row(i)}`))
  out(lines.join('\n') || '(empty)')
}

// ---------- roadmap ----------
cmds.roadmap = ({ pos, opt }) => {
  const st = store()
  const rm = st.board.roadmap
  const sub = pos[0] ?? 'ls'
  if (sub === 'ls') {
    const lines = []
    for (const h of HORIZONS) {
      const rs = rm.filter((r) => r.horizon === h)
      if (!rs.length) continue
      lines.push(`${h.toUpperCase()}:`)
      for (const r of rs) {
        const ep = r.epic ? st.board.items.find((i) => i.id === r.epic) : null
        const kids = ep ? st.board.items.filter((i) => i.epic === ep.id) : []
        const prog = kids.length ? ` ${kids.filter((i) => i.status === 'done').length}/${kids.length} done` : ''
        lines.push(`  ${pad(r.id, 5)} ${r.title}${r.epic ? ` → ${r.epic}` : ''}${prog}${r.goal ? ` — ${r.goal}` : ''}`)
      }
    }
    return out(lines.join('\n') || '(roadmap empty)')
  }
  if (sub === 'add') {
    const title = pos.slice(1).join(' ').trim() || die('title required')
    const horizon = opt.horizon ?? 'later'
    if (!HORIZONS.includes(horizon)) die(`horizon ${HORIZONS.join('|')}`)
    st.board.meta.rseq = (st.board.meta.rseq ?? 0) + 1
    const r = { id: `R-${st.board.meta.rseq}`, title, horizon, epic: opt.epic ? normId(opt.epic, st.key) : undefined, goal: opt.goal, added: today() }
    if (r.epic) st.item(r.epic)
    rm.push(r)
    st.save(); st.log(`roadmap ${r.id} (${horizon}) ${title}`)
    return out(`${r.id} added to ${horizon}`)
  }
  const r = rm.find((x) => x.id === String(pos[1]).toUpperCase()) ?? die(`no roadmap item ${pos[1]}`)
  if (sub === 'rm') { st.board.roadmap = rm.filter((x) => x !== r); st.save(); st.log(`roadmap ${r.id} removed`); return out(`${r.id} removed`) }
  if (sub === 'set') {
    for (const p of pos.slice(2)) {
      const [k, ...vs] = p.split('='); const v = vs.join('=')
      if (!['title', 'horizon', 'epic', 'goal'].includes(k)) die(`roadmap field ${k}?`)
      if (k === 'horizon' && !HORIZONS.includes(v)) die(`horizon ${HORIZONS.join('|')}`)
      r[k] = k === 'epic' ? normId(v, st.key) : v
    }
    st.save(); st.log(`roadmap ${r.id} ${pos.slice(2).join(' ')}`)
    return out(`${r.id} updated`)
  }
  die('roadmap ls|add|set|rm')
}

// ---------- sprints ----------
function velocity(st) {
  const closed = st.board.sprints.filter((s) => s.status === 'closed' && s.velocity != null).slice(-3)
  return closed.length ? Math.round(closed.reduce((n, s) => n + s.velocity, 0) / closed.length) : null
}

cmds.sprint = ({ pos, opt }) => {
  const st = store()
  const sub = pos[0] ?? 'ls'
  const sps = st.board.sprints
  const target = () => st.activeSprint() ?? sps.find((s) => s.status === 'planned') ?? die('no active/planned sprint — `sprint new`')
  if (sub === 'ls') return out(sps.map((s) => { const { total, done } = sprintStats(s, st.board.items); return `${s.id} ${s.status} ${s.start}..${s.end} ${done}/${total}p "${s.goal}"${s.velocity != null ? ` vel=${s.velocity}` : ''}` }).join('\n') || '(no sprints)')
  if (sub === 'new') {
    if (sps.some((s) => s.status === 'planned')) die('a planned sprint already exists')
    const n = sps.length + 1
    const start = opt.start ?? today()
    const end = new Date(new Date(start).getTime() + Number(opt.days ?? st.cfg.sprintDays) * 864e5 - 864e5).toISOString().slice(0, 10)
    const s = { id: `SP-${n}`, goal: opt.goal ?? '', start, end, status: 'planned' }
    sps.push(s); st.save(); st.log(`sprint ${s.id} planned "${s.goal}"`)
    return out(`${s.id} planned ${start}..${end} capacity≈${velocity(st) ?? st.cfg.capacity}p`)
  }
  if (sub === 'add' || sub === 'rm') {
    const s = target()
    for (const id of pos.slice(1)) { const it = st.item(id); if (sub === 'add') it.sprint = s.id; else delete it.sprint; it.updated = today() }
    st.save()
    const { total } = sprintStats(s, st.board.items)
    const cap = velocity(st) ?? st.cfg.capacity
    return out(`${s.id} now ${total}p / capacity ${cap}p${total > cap ? ' — OVER capacity' : ''}`)
  }
  if (sub === 'start') {
    if (st.activeSprint()) die(`${st.activeSprint().id} is still active — close it first`)
    const s = sps.find((x) => x.status === 'planned') ?? die('no planned sprint')
    s.status = 'active'; s.start = today()
    s.end = new Date(Date.now() + Number(opt.days ?? st.cfg.sprintDays) * 864e5 - 864e5).toISOString().slice(0, 10)
    st.save(); st.log(`sprint ${s.id} started`)
    return out(`${s.id} active until ${s.end}`)
  }
  if (sub === 'close') {
    const s = st.activeSprint() ?? die('no active sprint')
    const { its, done } = sprintStats(s, st.board.items)
    const carried = its.filter((i) => i.status !== 'done')
    for (const i of carried) { delete i.sprint; if (i.status === 'doing' || i.status === 'review') i.carried = (i.carried ?? 0) + 1 }
    s.status = 'closed'; s.velocity = done; s.closed = today()
    st.save(); st.log(`sprint ${s.id} closed velocity=${done}p carried=${carried.map((i) => i.id).join(',') || 'none'}`)
    return out(`${s.id} closed. velocity ${done}p. carried over (unassigned): ${carried.map((i) => i.id).join(', ') || 'none'}\navg velocity: ${velocity(st)}p`)
  }
  if (sub === 'plan') {
    const s = target()
    const cap = velocity(st) ?? st.cfg.capacity
    const { total } = sprintStats(s, st.board.items)
    const cand = st.board.items.filter((i) => i.status === 'ready' && !i.sprint && !i.blocked && i.type !== 'epic').sort(sortItems)
    let acc = total
    const pick = []
    for (const i of cand) if (acc + (i.points ?? 0) <= cap) { pick.push(i); acc += i.points ?? 0 }
    return out(`${s.id} "${s.goal}" committed ${total}p, capacity ${cap}p\nsuggested (ready, by prio): ${pick.map((i) => `${i.id}(${i.points ?? '?'}p ${i.prio})`).join(' ') || 'none'} → ${acc}p\nnot ready yet: ${st.board.items.filter((i) => i.status === 'backlog' && i.type !== 'epic').length} backlog items (groom with /gdev:refine)`)
  }
  die('sprint ls|new|add|rm|start|close|plan')
}

// ---------- git sync (deterministic tracking, no LLM) ----------
const git = (args, cwd) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const RANK = { idea: 0, backlog: 1, ready: 2, doing: 3, review: 4, done: 5, dropped: 6 }

function advance(st, id, to, why, changes) {
  const it = st.board.items.find((i) => i.id === id)
  if (!it || it.type === 'epic' || ['done', 'dropped'].includes(it.status)) return
  if (RANK[to] <= RANK[it.status]) return
  it.status = to; it.updated = today()
  if (to === 'done') { it.doneAt = today(); delete it.blocked }
  changes.push(`${id}→${to}`)
  st.log(`${id} → ${to} (${why})`)
}

function idsIn(st, text) {
  const re = new RegExp(`\\b${st.key}-(\\d+)\\b`, 'gi')
  return [...new Set([...String(text).matchAll(re)].map((m) => `${st.key}-${m[1]}`))]
}

function closeEpics(st, changes) {
  for (const e of st.board.items.filter((i) => i.type === 'epic' && !['done', 'dropped'].includes(i.status))) {
    const kids = st.board.items.filter((i) => i.epic === e.id && i.status !== 'dropped')
    if (kids.length && kids.every((i) => i.status === 'done')) { e.status = 'done'; e.doneAt = today(); changes.push(`${e.id}→done`); st.log(`${e.id} → done (all stories done)`) }
    else if (kids.some((i) => ['doing', 'review', 'done'].includes(i.status)) && RANK[e.status] < RANK.doing) { e.status = 'doing'; changes.push(`${e.id}→doing`) }
  }
}

// Sync state lives in the git dir (untracked), NOT in board.json: restoring/reverting the board
// from git must not rewind it, or the hook re-applies old commits and undoes manual board edits.
function syncState(st) {
  const p = git(['rev-parse', '--git-path', 'gdev-pm-sync.json'], st.root)
  const file = p && path.resolve(st.root, p)
  let s = {}
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  return { file, seen: new Set(s.seen ?? []), branch: s.branch ?? null, fresh: !s.seen }
}

cmds.sync = ({ opt }) => {
  const st = store()
  const changes = []
  const head = git(['rev-parse', 'HEAD'], st.root)
  if (!head) return out('sync: not a git repo (skipped)')
  const ss = syncState(st)
  // First run in this clone: only commits since the board's last recorded sync (or last 30).
  // Afterwards: recent history, minus commits already applied — each commit is applied once, ever.
  const last = st.board.meta.lastSync
  const range = !ss.fresh ? ['-200'] : last && git(['cat-file', '-t', last], st.root) ? [`${last}..HEAD`] : ['-30']
  const raw = git(['log', ...range, '--name-only', '--format=%x1e%H%n%s%n%b%x1f'], st.root) ?? ''
  const pmPrefix = (git(['rev-parse', '--show-prefix'], st.root) ?? '') + '.pm/'
  const closeRe = new RegExp(`\\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?|done)\\b[:\\s]*#?(${st.key}-\\d+)`, 'gi')
  const commits = raw.split('\x1e').filter((c) => c.trim()).map((c) => {
    const [hdr, files = ''] = c.split('\x1f')
    const nl = hdr.indexOf('\n')
    return { sha: hdr.slice(0, nl).trim(), msg: hdr.slice(nl + 1), files: files.split('\n').map((f) => f.trim()).filter(Boolean) }
  })
  for (const { sha, msg, files } of commits.reverse()) {
    if (ss.seen.has(sha)) continue
    ss.seen.add(sha)
    // A commit that only touches .pm/ is board bookkeeping (triage, refinement, planning):
    // the IDs it mentions are not evidence that work started.
    if (!files.length || files.every((f) => f.replaceAll('\\', '/').startsWith(pmPrefix))) continue
    for (const id of idsIn(st, msg)) advance(st, id, 'doing', 'commit', changes)
    for (const m of msg.matchAll(closeRe)) advance(st, m[2].toUpperCase(), st.cfg.doneOnMerge ? 'review' : 'done', 'commit closes', changes)
  }
  // Branch IDs count when the branch changes (or on PR create/merge), not on every git command —
  // otherwise a manual `move <ID> backlog` is undone by the next commit on that branch.
  const branch = git(['branch', '--show-current'], st.root) ?? ''
  if (branch !== ss.branch || opt.review || opt.done || opt.force) {
    for (const id of idsIn(st, branch)) advance(st, id, opt.review ? 'review' : 'doing', `branch ${branch}`, changes)
  }
  if (opt.done) for (const id of idsIn(st, branch)) advance(st, id, 'done', 'merged', changes)
  closeEpics(st, changes)
  if (ss.file) {
    try { writeAtomic(ss.file, JSON.stringify({ branch, seen: [...ss.seen].slice(-2000) }) + '\n') } catch {}
  }
  // board.json is tracked: write it only when a status changed. Rewriting lastSync on every commit
  // left the tree dirty, and `gh pr merge --delete-branch` then could not switch to the base branch.
  // Applied commits are remembered in the git dir (syncState), so a stale lastSync costs nothing.
  if (changes.length) {
    st.board.meta.lastSync = head
    st.save()
  }
  out(changes.length ? `PM sync: ${changes.join(', ')}` : 'PM sync: no changes')
}

// GDEV_GH: a node script that stands in for gh (tests only).
const gh = (args, cwd) => process.env.GDEV_GH
  ? execFileSync(process.execPath, [process.env.GDEV_GH, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  : execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const gitOk = (args, cwd) => { try { execFileSync('git', args, { cwd, stdio: 'ignore' }); return true } catch { return false } }

// After `gh pr merge`: gh merges on GitHub, then switches to the base branch locally — and stops if the
// tree is dirty, which the board hook itself causes (status changes land in .pm/). Finish that local
// step when the only local changes are under .pm/: carry them over, update the base, drop the branch.
function finishMerge(root, prArg, deleteBranch) {
  let pr
  try { pr = JSON.parse(gh(['pr', 'view', ...(prArg ? [prArg] : []), '--json', 'state,headRefName,baseRefName'], root)) } catch { return '' }
  if (pr.state !== 'MERGED') return ''
  const head = pr.headRefName, base = pr.baseRefName
  if ((git(['branch', '--show-current'], root) ?? '') !== head) return ''
  const pmPrefix = (git(['rev-parse', '--show-prefix'], root) ?? '') + '.pm/'
  // Tracked changes, staged or not, as paths from the repo root (untracked files do not block a switch).
  const dirty = (git(['diff', '--name-only', 'HEAD', '--'], root) ?? '').split('\n').filter(Boolean)
  if (dirty.some((f) => !f.replaceAll('\\', '/').startsWith(pmPrefix)))
    return `gdev: PR merged, but still on ${head} — local changes outside .pm/; commit or stash them, then \`git switch ${base}\` and pull`
  const remote = git(['config', `branch.${head}.remote`], root) || git(['config', `branch.${base}.remote`], root) || 'origin'
  const stashed = dirty.length > 0 && gitOk(['stash', 'push', '-q', '-m', 'gdev: board after merge', '--', '.pm'], root)
  if (!gitOk(['switch', '-q', base], root)) {
    if (stashed) gitOk(['stash', 'pop', '-q'], root)
    return `gdev: PR merged, but could not switch to ${base}; still on ${head}`
  }
  const pulled = gitOk(['pull', '-q', '--ff-only', remote, base], root)
  const restored = !stashed || gitOk(['stash', 'pop', '-q'], root)
  const deleted = deleteBranch && gitOk(['branch', '-D', head], root)
  return [`gdev: switched to ${base}`, pulled ? `pulled ${remote}/${base}` : `pull ${remote}/${base} failed — pull by hand`,
    stashed ? (restored ? 'board changes kept (uncommitted)' : 'board changes left in `git stash` (pop failed)') : null,
    deleted ? `deleted local ${head}` : null].filter(Boolean).join('; ')
}

cmds.pr = ({ pos }) => {
  const st = store()
  let info = ''
  try { info = gh(['pr', 'view', String(pos[0] ?? ''), '--json', 'title,headRefName,body,state'], st.root) } catch { return out('pm pr: gh unavailable or PR not found') }
  const pr = JSON.parse(info)
  const changes = []
  const to = pr.state === 'MERGED' ? 'done' : 'review'
  for (const id of idsIn(st, `${pr.title} ${pr.headRefName} ${pr.body}`)) advance(st, id, to, `PR #${pos[0]} ${pr.state.toLowerCase()}`, changes)
  closeEpics(st, changes)
  st.save()
  out(changes.length ? `PM sync: ${changes.join(', ')}` : 'PM sync: no changes')
}

cmds.log = ({ pos }) => { const st = store(); st.log(pos.join(' ')); out('logged') }

cmds.doctor = () => {
  const st = store()
  const p = []
  const ids = new Set()
  for (const i of st.board.items) {
    if (ids.has(i.id)) p.push(`duplicate id ${i.id}`); ids.add(i.id)
    if (!STATUSES.includes(i.status)) p.push(`${i.id} bad status ${i.status}`)
    if (!TYPES.includes(i.type)) p.push(`${i.id} bad type ${i.type}`)
    if (i.epic && !st.board.items.some((e) => e.id === i.epic)) p.push(`${i.id} epic ${i.epic} missing`)
    if (!fs.existsSync(st.itemFile(i.id))) p.push(`${i.id} item file missing`)
    if (i.sprint && !st.board.sprints.some((s) => s.id === i.sprint)) p.push(`${i.id} sprint ${i.sprint} missing`)
  }
  for (const f of fs.readdirSync(path.join(st.dir, 'items'))) if (!ids.has(f.replace(/\.md$/, ''))) p.push(`orphan file items/${f}`)
  if (st.board.sprints.filter((s) => s.status === 'active').length > 1) p.push('more than one active sprint')
  const doing = st.board.items.filter((i) => i.status === 'doing' && i.type !== 'epic').length
  if (doing > st.cfg.wip) p.push(`WIP ${doing} > limit ${st.cfg.wip}`)
  const stale = st.board.items.filter((i) => ['doing', 'review'].includes(i.status) && (new Date(today()) - new Date(i.updated)) / 864e5 > 7)
  if (stale.length) p.push(`stale (>7d in doing/review): ${stale.map((i) => i.id).join(', ')}`)
  const prod = path.join(st.dir, 'product.md')
  if (fs.existsSync(prod) && fs.readFileSync(prod, 'utf8').split('\n').length > 120) p.push('product.md over 120 lines — move detail to docs/')
  const local = path.join(st.dir, 'pm.mjs')
  if (fs.existsSync(local) && path.resolve(local) !== path.resolve(SELF)) {
    const v = /const VERSION = '([^']+)'/.exec(fs.readFileSync(local, 'utf8'))?.[1]
    if (v !== VERSION) p.push(`.pm/pm.mjs is ${v}, plugin is ${VERSION} — run \`pm upgrade\``)
  }
  out(p.length ? p.map((x) => `✗ ${x}`).join('\n') : '✓ board healthy')
}

cmds.upgrade = () => {
  const st = store()
  if (path.resolve(path.join(st.dir, 'pm.mjs')) === path.resolve(SELF)) return out('run this from the plugin copy, not .pm/pm.mjs')
  fs.copyFileSync(SELF, path.join(st.dir, 'pm.mjs'))
  for (const f of fs.readdirSync(TEMPLATES)) { const dst = path.join(st.dir, 'templates', f); if (!fs.existsSync(dst)) fs.cpSync(path.join(TEMPLATES, f), dst) }
  out(`.pm/pm.mjs upgraded to ${VERSION}`)
}

// ---------- Claude Code hook entry points (read hook JSON on stdin) ----------
function readStdin() { try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { return {} } }
const ctx = (event, text) => out(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }))

function quiet(fn) {
  const w = process.stdout.write.bind(process.stdout)
  let buf = ''
  process.stdout.write = (s) => { buf += s; return true }
  try { fn() } finally { process.stdout.write = w }
  return buf.trim()
}

cmds['hook-session'] = () => {
  const input = readStdin()
  const root = findRoot(input.cwd ?? process.cwd())
  if (!root) return // zero cost in projects that do not use pm
  process.chdir(root)
  const local = path.join(root, '.pm', 'pm.mjs')
  if (path.resolve(local) !== path.resolve(SELF)) { try { fs.copyFileSync(SELF, local) } catch {} }
  const s = quiet(() => cmds.status())
  ctx('SessionStart', `PM board (.pm/, CLI: node .pm/pm.mjs <cmd>; skills /gdev:*):\n${s}`)
}

// A git/gh command counts only where a command starts (line start or after ; & | ( , optional VAR=x
// prefixes) — not inside text, e.g. a CHANGELOG line passed to node -e that mentions "gh pr merge".
const at = (re) => new RegExp(`(?:^|[;&|(\\n])\\s*(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*${re}`)

cmds['hook-bash'] = () => {
  const input = readStdin()
  const c = input.tool_input?.command ?? ''
  if (!at('(?:git\\s+(?:commit|merge|pull|checkout|switch)|gh\\s+pr\\s+(?:create|merge))\\b').test(c)) return
  // `git checkout [<rev>] -- <paths>` restores files (e.g. the board) — it is not a branch change.
  if (at('git\\s+checkout\\b[^;&|\\n]*\\s--(?:\\s|$)').test(c) && !at('(?:git\\s+(?:commit|merge|pull|switch)|gh\\s+pr)\\b').test(c)) return
  const root = findRoot(input.cwd ?? process.cwd())
  if (!root) return
  process.chdir(root)
  let res = ''
  const mergeCmd = at('gh\\s+pr\\s+merge\\b[^;&|\\n]*').exec(c)?.[0]
  const pr = mergeCmd && /\bmerge\s+(\d+)/.exec(mergeCmd)
  if (pr) res = quiet(() => cmds.pr({ pos: [pr[1]], opt: {} }))
  else if (mergeCmd) res = quiet(() => cmds.sync({ pos: [], opt: { done: true } }))
  else res = quiet(() => cmds.sync({ pos: [], opt: { review: at('gh\\s+pr\\s+create\\b').test(c) } }))
  const local = mergeCmd ? finishMerge(root, pr?.[1], /\s(--delete-branch|-d)\b/.test(mergeCmd)) : ''
  const msg = [res && !/no changes|skipped/.test(res) ? res : '', local].filter(Boolean).join('\n')
  if (msg) ctx('PostToolUse', msg)
}

// ---------- main ----------
const [cmd = 'help', ...rest] = process.argv.slice(2)
const fn = cmds[cmd] ?? die(`unknown command "${cmd}" — try \`help\``)
try { fn(parseArgs(rest)) } catch (e) { die(e.message) }

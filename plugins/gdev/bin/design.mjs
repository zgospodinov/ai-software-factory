#!/usr/bin/env node
// design.mjs — zero-dependency CLI for /gdev:design. Keeps .design/registry.json without a model
// reading or rewriting it, and does the mechanical part of a design audit (scan) for zero tokens.
// Output is compact on purpose.
import fs from 'node:fs'
import path from 'node:path'

const VERSION = '0.2.5'
const COLLECTIONS = { system: 'systems', canvas: 'canvases', screen: 'screens', export: 'exports' }
const KEY = { systems: 'slug', canvases: 'product', screens: 'id', exports: 'id' }
const ARRAY_FIELDS = new Set(['themes', 'states', 'viewports', 'artboards', 'styling', 'themeFiles', 'pages'])
const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'coverage', '.turbo', '.cache', 'vendor', '.design', '.pm', 'target', 'bin', 'obj', '.venv', '__pycache__'])
const SRC_EXT = /\.(tsx?|jsx?|vue|svelte|astro|html?|css|scss|sass|less|dart|swift|kt)$/i

const today = () => new Date().toISOString().slice(0, 10)
const out = (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n')
const die = (m) => { process.stderr.write(`design: ${m}\n`); process.exit(1) }

function findRoot(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.design')) || fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    dir = up
  }
}
const ROOT = findRoot()
const REG = path.join(ROOT, '.design', 'registry.json')

function load() {
  if (!fs.existsSync(REG)) return null
  try { return JSON.parse(fs.readFileSync(REG, 'utf8')) } catch (e) { die(`registry.json is not valid JSON: ${e.message}`) }
}
function save(reg) {
  fs.mkdirSync(path.dirname(REG), { recursive: true })
  const tmp = `${REG}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n')
  fs.renameSync(tmp, REG)
}
const empty = (product) => ({ v: 1, product: product ?? path.basename(ROOT), stack: {}, systems: [], canvases: [], screens: [], exports: [] })

function parseVal(k, v) {
  if (v === 'null' || v === '') return null
  if (ARRAY_FIELDS.has(k)) {
    if (k === 'pages') return v.split(',').filter(Boolean).map((p) => { const [id, ...n] = p.split(':'); return { id, name: n.join(':') || id } })
    return v.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return v
}

// ---------- commands ----------
function cmdInit(args) {
  if (load()) return out(`exists: ${path.relative(ROOT, REG)}`)
  save(empty(args[0]))
  out(`created ${path.relative(ROOT, REG)}`)
}

// set <system|canvas|screen|export> <id> key=value ...   (upsert; arrays comma-separated; pages id:Name,…)
function cmdSet([kind, id, ...pairs]) {
  const coll = COLLECTIONS[kind]
  if (!coll || !id) die('usage: set <system|canvas|screen|export> <id> key=value ...')
  const reg = load() ?? empty()
  reg[coll] ??= []
  const key = KEY[coll]
  let row = reg[coll].find((r) => r[key] === id)
  const isNew = !row
  if (!row) { row = { [key]: id }; reg[coll].push(row) }
  for (const p of pairs) {
    const i = p.indexOf('=')
    if (i < 1) die(`bad pair "${p}" (use key=value)`)
    const k = p.slice(0, i); const v = parseVal(k, p.slice(i + 1))
    if (v === null) delete row[k]; else row[k] = v
  }
  const stamp = { systems: 'updated', exports: 'from' }[coll]
  if (stamp && !pairs.some((p) => p.startsWith(`${stamp}=`))) row[stamp] = today()
  save(reg)
  out(`${isNew ? 'added' : 'updated'} ${kind} ${id}`)
}

function cmdRm([kind, id]) {
  const coll = COLLECTIONS[kind]
  const reg = load() ?? die('no registry')
  const before = (reg[coll] ?? []).length
  reg[coll] = (reg[coll] ?? []).filter((r) => r[KEY[coll]] !== id)
  save(reg)
  out(before === reg[coll].length ? `not found ${kind} ${id}` : `removed ${kind} ${id}`)
}

function cmdStack(pairs) {
  const reg = load() ?? empty()
  for (const p of pairs) { const i = p.indexOf('='); const k = p.slice(0, i); reg.stack[k] = parseVal(k, p.slice(i + 1)) }
  save(reg); out(`stack ${JSON.stringify(reg.stack)}`)
}

function cmdIndex() {
  const reg = load()
  if (!reg) return out('No .design/registry.json — run /gdev:design audit (existing project) or /gdev:design system new.')
  const L = [`${reg.product} · stack: ${[reg.stack?.framework, ...(reg.stack?.styling ?? [])].filter(Boolean).join(', ') || '?'}`]
  const kids = (slug) => reg.systems.filter((s) => s.extends === slug)
  const printSys = (s, ind) => {
    const ex = reg.exports.filter((e) => e.system === s.slug).map((e) => e.target).join(',')
    L.push(`${ind}◆ ${s.title ?? s.slug} [${s.scope ?? '?'}] ${s.themes?.join('/') ?? ''} ${s.updated ?? ''}${ex ? ` → ${ex}` : ''}${s.url ? `\n${ind}  ${s.url}` : ''}`)
    for (const c of kids(s.slug)) printSys(c, ind + '  ')
  }
  L.push('Systems:')
  for (const s of reg.systems.filter((s) => !s.extends || !reg.systems.some((b) => b.slug === s.extends))) printSys(s, '  ')
  if (!reg.systems.length) L.push('  (none)')
  L.push('Canvases:')
  for (const c of reg.canvases) {
    L.push(`  ▣ ${c.product} (DS ${c.system ?? '?'})${c.url ? ` ${c.url}` : ''}`)
    const pages = c.pages?.length ? c.pages : [{ id: undefined, name: '(no page)' }]
    for (const p of pages) {
      const sc = reg.screens.filter((s) => (s.canvas ?? c.product) === c.product && s.page === p.id)
      if (!sc.length && p.id === undefined) continue
      L.push(`    ▸ ${p.name}${p.id && p.id !== p.name ? ` (${p.id})` : ''}: ${sc.length} screen(s)`)
      for (const s of sc) L.push(`      · ${s.id}${s.item ? ` [${s.item}]` : ''} ${s.states?.join('/') ?? ''}${s.viewports ? ` · ${s.viewports.join('/')}` : ''}`)
    }
  }
  if (!reg.canvases.length) L.push('  (none)')
  out(L.join('\n'))
}

function boardItems() {
  const f = path.join(ROOT, '.pm', 'board.json')
  if (!fs.existsSync(f)) return null
  try { const b = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(b.items) ? b.items : Object.values(b.items ?? {}) } catch { return null }
}

function cmdCheck() {
  const reg = load()
  if (!reg) return out('No registry.')
  const P = []
  const slugs = new Set(reg.systems.map((s) => s.slug))
  for (const s of reg.systems) {
    if (s.extends && !slugs.has(s.extends)) P.push(`system ${s.slug}: extends unknown "${s.extends}"`)
    if (!s.url) P.push(`system ${s.slug}: no artifact url`)
    if (s.source && !fs.existsSync(path.join(ROOT, s.source))) P.push(`system ${s.slug}: source ${s.source} missing`)
    const ex = reg.exports.filter((e) => e.system === s.slug)
    if (!ex.length && s.scope === 'product') P.push(`system ${s.slug}: no export → /gdev:design export <framework>`)
    for (const e of ex) {
      if (s.updated && e.from && e.from < s.updated) P.push(`export ${e.target} (${e.path}) older than ${s.slug} (${e.from} < ${s.updated}) → re-export`)
      if (e.path && !fs.existsSync(path.join(ROOT, e.path))) P.push(`export ${e.target}: file ${e.path} missing`)
    }
  }
  for (const c of reg.canvases) if (c.system && !slugs.has(c.system)) P.push(`canvas ${c.product}: unknown system "${c.system}"`)
  const items = boardItems()
  const byId = items ? new Map(items.map((i) => [i.id, i])) : null
  for (const s of reg.screens) {
    if (!s.item) P.push(`screen ${s.id}: no board item`)
    else if (byId && !byId.has(s.item)) P.push(`screen ${s.id}: item ${s.item} not on board`)
    else if (byId && byId.get(s.item).status === 'dropped') P.push(`screen ${s.id}: item ${s.item} dropped`)
    if (!s.states?.some((x) => /error/.test(x))) P.push(`screen ${s.id}: no error state`)
  }
  out(P.length ? P.join('\n') : 'design: ok')
}

// ---------- scan: mechanical audit inventory ----------
function walk(dir, files = [], depth = 0) {
  if (depth > 12) return files
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return files }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.storybook') { if (e.isDirectory()) continue }
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!IGNORE.has(e.name)) walk(p, files, depth + 1) } else files.push(p)
    if (files.length > 20000) break
  }
  return files
}

function cmdScan() {
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
  const files = walk(ROOT)
  const L = []
  // stack
  const pkgs = files.filter((f) => path.basename(f) === 'package.json').slice(0, 5)
  const deps = {}
  for (const f of pkgs) { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); Object.assign(deps, j.dependencies, j.devDependencies) } catch {} }
  const KNOWN = ['react', 'next', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', '@angular/core', 'astro', 'solid-js', 'tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss', '@mui/material', '@chakra-ui/react', '@mantine/core', '@radix-ui/themes', '@angular/material', 'vuetify', 'bootstrap', 'styled-components', '@emotion/react', 'style-dictionary', 'class-variance-authority', '@storybook/react', 'storybook', 'lucide-react', '@heroicons/react', 'framer-motion', 'sass']
  const found = KNOWN.filter((k) => deps[k]).map((k) => `${k}@${String(deps[k]).replace(/^[\^~]/, '')}`)
  const markers = ['components.json', 'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs', 'pubspec.yaml', 'angular.json', 'theme.ts', 'theme.js', 'tokens.json'].flatMap((m) => files.filter((f) => path.basename(f) === m).slice(0, 3).map(rel))
  L.push(`Stack: ${found.join(', ') || '(no package.json deps recognised)'}`)
  if (markers.length) L.push(`Config: ${markers.join(', ')}`)
  // token sources & hard-coded values
  const src = files.filter((f) => SRC_EXT.test(f))
  const tokenSrc = []; const bypass = []; let hexTotal = 0, arbTotal = 0, inlineTotal = 0
  const allHex = new Map()
  for (const f of src) {
    let t; try { const st = fs.statSync(f); if (st.size > 400000) continue; t = fs.readFileSync(f, 'utf8') } catch { continue }
    const vars = (t.match(/--[a-z][\w-]*\s*:/gi) ?? []).length
    const theme = /@theme\b|createTheme\(|createSystem\(|extendTheme\(|defineConfig\(\{[^]*?theme|mat\.theme\(|createVuetify\(|\$primary\s*:/.test(t)
    if (vars >= 8 || theme) tokenSrc.push(`${rel(f)}${vars ? ` (${vars} vars)` : ''}${theme ? ' [theme]' : ''}`)
    const isStyleDef = vars >= 8 || theme
    const hex = isStyleDef ? [] : (t.match(/(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g) ?? []).filter((h) => !/^#\d{3,4}$/.test(h) || /\.(css|scss|less)$/.test(f))
    const fn = isStyleDef ? 0 : (t.match(/\b(?:rgba?|hsla?|oklch)\(/g) ?? []).length
    const arb = (t.match(/\b[a-z-]+-\[(?:#|\d)[^\]]*\]/g) ?? []).length
    const inl = (t.match(/style=\{?\{?["'`]?[^>]{0,80}?\b(?:\d+px|#[0-9a-f]{3,6})/gi) ?? []).length
    for (const h of hex) allHex.set(h.toLowerCase(), (allHex.get(h.toLowerCase()) ?? 0) + 1)
    const n = hex.length + fn + arb + inl
    hexTotal += hex.length + fn; arbTotal += arb; inlineTotal += inl
    if (n) bypass.push([n, rel(f)])
  }
  L.push(`Token sources (${tokenSrc.length}): ${tokenSrc.slice(0, 8).join('; ') || 'none'}${tokenSrc.length > 8 ? ' …' : ''}`)
  L.push(`Hard-coded: ${hexTotal} colors (${allHex.size} distinct), ${arbTotal} arbitrary Tailwind values, ${inlineTotal} inline styles`)
  bypass.sort((a, b) => b[0] - a[0])
  if (bypass.length) L.push(`Top offenders: ${bypass.slice(0, 8).map(([n, f]) => `${f} (${n})`).join(', ')}`)
  const topHex = [...allHex].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, n]) => `${h}×${n}`)
  if (topHex.length) L.push(`Most used raw colors: ${topHex.join(' ')}`)
  // components
  const compFiles = files.filter((f) => /[\\/]components?[\\/]/i.test(f) && /\.(tsx|jsx|vue|svelte|astro)$/.test(f))
  const names = new Map()
  for (const f of compFiles) { let b = path.basename(f).replace(/\.(tsx|jsx|vue|svelte|astro)$/, ''); if (/^index$/i.test(b)) b = path.basename(path.dirname(f)); const k = b.toLowerCase().replace(/[-_]/g, ''); names.set(k, [...(names.get(k) ?? []), rel(f)]) }
  const dups = [...names].filter(([, v]) => v.length > 1)
  const compDirs = [...new Set(compFiles.map((f) => rel(path.dirname(f)).replace(/\/[^/]+$/, (m) => (/components?$/i.test(path.dirname(f)) ? '' : m))))].slice(0, 6)
  L.push(`Components: ${compFiles.length} files in ${compDirs.join(', ') || '-'}`)
  if (dups.length) L.push(`Same-name components (${dups.length}): ${dups.slice(0, 6).map(([k, v]) => `${k}×${v.length}`).join(', ')}`)
  const stories = files.filter((f) => /\.stories\.(tsx?|jsx?|mdx|vue|svelte)$/.test(f)).length
  L.push(`Storybook stories: ${stories}`)
  // assets & design artefacts
  const assets = { logos: [], fonts: 0, icons: 0, images: 0 }
  const designDirs = new Set(); const designFiles = []
  for (const f of files) {
    const r = rel(f); const b = path.basename(f).toLowerCase()
    if (/\.(woff2?|ttf|otf)$/.test(b)) assets.fonts++
    else if (/logo|brand|wordmark/.test(b) && /\.(svg|png|webp|jpe?g)$/.test(b)) assets.logos.push(r)
    else if (/\.svg$/.test(b) && /icon/i.test(r)) assets.icons++
    else if (/\.(png|jpe?g|webp|gif|svg)$/.test(b)) assets.images++
    if (/\.(fig|sketch|xd|penpot|pen)$/.test(b)) designFiles.push(r)
    const m = r.match(/^(.*?(?:^|\/)(?:design|designs|mockups?|wireframes?|ui-kit|brand|style-?guide)(?:\/|$))/i)
    if (m) designDirs.add(m[1].replace(/\/$/, ''))
  }
  L.push(`Assets: ${assets.logos.length} logo files${assets.logos.length ? ` (${assets.logos.slice(0, 3).join(', ')})` : ''}, ${assets.fonts} fonts, ${assets.icons} icon SVGs, ${assets.images} images`)
  if (designDirs.size || designFiles.length) L.push(`Design artefacts: ${[...designDirs].slice(0, 6).join(', ')}${designFiles.length ? ` · files: ${designFiles.slice(0, 4).join(', ')}` : ''}`)
  const docs = files.filter((f) => /\.mdx?$/.test(f)).slice(0, 400)
  const links = new Set()
  for (const f of docs) { try { for (const m of fs.readFileSync(f, 'utf8').matchAll(/https?:\/\/(?:www\.)?(figma\.com|penpot\.app|claude\.ai\/artifact)[^\s)"'>]*/g)) links.add(m[0]) } catch {} }
  if (links.size) L.push(`Design links in docs: ${[...links].slice(0, 5).join(' ')}`)
  // routes / screens
  const routes = files.filter((f) => /[\\/](app|pages|routes|views|screens)[\\/]/.test(f) && /(page|index|\+page|route|View|Screen)\.(tsx?|jsx?|vue|svelte|astro|dart)$|[\\/]pages[\\/][^\\/]+\.(tsx?|jsx?|vue|astro)$/.test(f))
  L.push(`Screens/routes: ${routes.length}${routes.length ? ` (${routes.slice(0, 6).map(rel).join(', ')}${routes.length > 6 ? ' …' : ''})` : ''}`)
  L.push(`Registry: ${fs.existsSync(REG) ? 'present' : 'none'} · board: ${fs.existsSync(path.join(ROOT, '.pm')) ? 'present' : 'none'}`)
  out(L.join('\n'))
}

const HELP = `design.mjs ${VERSION} — .design/registry.json without a model
  init [product]                         create the registry
  index                                  tree: systems → canvases → pages → screens
  check                                  drift & gaps (stale exports, screens w/o item or error state…)
  scan                                   mechanical audit inventory of the repo (stack, tokens, hard-coded values, components, assets, routes)
  set <system|canvas|screen|export> <id> k=v …   upsert (arrays comma-separated; pages=id:Name,…; k= removes)
  rm <system|canvas|screen|export> <id>
  stack k=v …                            framework=react styling=tailwind@4,shadcn themeFiles=src/app/globals.css`

const [cmd, ...args] = process.argv.slice(2)
switch (cmd) {
  case 'init': cmdInit(args); break
  case 'index': cmdIndex(); break
  case 'check': cmdCheck(); break
  case 'scan': cmdScan(); break
  case 'set': cmdSet(args); break
  case 'rm': cmdRm(args); break
  case 'stack': cmdStack(args); break
  case 'version': out(VERSION); break
  default: out(HELP)
}

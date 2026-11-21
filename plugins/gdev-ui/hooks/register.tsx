import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GdevBoard, GdevItem, GdevView } from '../types'

// gdev-ui — a live view of the gdev board (.pm/board.json) beside the chat.
// Reads the file directly (no model calls, no tokens) and changes state only
// through the project's own CLI (`node .pm/pm.mjs`), so the board stays the
// single source of truth that the skills and the tracker agent also use.

const PANE = 'gdev-board'
const board = atom({ plugin: 'gdev-ui', key: 'board' } as const, null, { shape: 'board-2' })
const view = atom({ plugin: 'gdev-ui', key: 'view' } as const, 'sprint' as GdevView)
const isBandHidden = atom({ plugin: 'gdev-ui', key: 'isBandHidden' } as const, false)
const notice = atom({ plugin: 'gdev-ui', key: 'notice' } as const, '')

const FLOW: Record<string, string> = { backlog: 'ready', ready: 'doing', doing: 'review', review: 'done' }
const COLUMNS = ['doing', 'review', 'ready', 'backlog', 'done'] as const
const PRIO = ['P0', 'P1', 'P2', 'P3']

const bar = (done: number, total: number, width = 12) => {
  const n = total ? Math.round((done / total) * width) : 0
  return '█'.repeat(n) + '░'.repeat(width - n)
}
const daysLeft = (end: string) => Math.ceil((Date.parse(end) - Date.now()) / 864e5)
const byPrio = (a: GdevItem, b: GdevItem) =>
  PRIO.indexOf(a.prio) - PRIO.indexOf(b.prio) || (a.rank ?? 1e9) - (b.rank ?? 1e9)
const pts = (its: GdevItem[]) => its.reduce((n, i) => n + (i.points ?? 0), 0)

function summary(b: GdevBoard) {
  const sp = b.sprints.find(s => s.status === 'active')
  const work = b.items.filter(i => i.type !== 'epic' && i.status !== 'dropped')
  const scope = sp ? work.filter(i => i.sprint === sp.id) : []
  const done = pts(scope.filter(i => i.status === 'done'))
  const total = pts(scope)
  const doing = work.filter(i => i.status === 'doing')
  const blocked = work.filter(i => i.blocked && i.status !== 'done')
  const critical = work.filter(i => i.type === 'bug' && ['S1', 'S2'].includes(i.severity ?? '') && i.status !== 'done')
  return { sp, done, total, doing, blocked, critical }
}

let root = ''
let mtime = -1

async function locate($: EngineInterface) {
  const cwd = (await $.session.cwd()).replace(/\\/g, '/')
  const parts = cwd.split('/')
  for (let n = parts.length; n > 0; n--) {
    const dir = parts.slice(0, n).join('/')
    if (await $.fs.exists(`${dir}/.pm/board.json`)) return dir
  }
  return ''
}

// Reads the board when it changed; undefined = unchanged, null = no board here.
async function loadBoard($: EngineInterface, force: boolean): Promise<GdevBoard | null | undefined> {
  if (force) root = ''
  if (!root) root = await locate($)
  if (!root) {
    $.ui.status(undefined)
    return null
  }
  const stat = await $.fs.stat(`${root}/.pm/board.json`).catch(() => undefined)
  if (!stat) return null
  if (!force && stat.mtimeMs === mtime) return undefined
  mtime = stat.mtimeMs
  try {
    const raw = JSON.parse(await $.fs.read(`${root}/.pm/board.json`))
    const cfg = JSON.parse(await $.fs.read(`${root}/.pm/config.json`))
    const nb: GdevBoard = {
      root,
      name: cfg.name,
      key: cfg.key,
      wip: cfg.wip ?? 2,
      items: raw.items ?? [],
      sprints: raw.sprints ?? [],
      roadmap: raw.roadmap ?? [],
    }
    const s = summary(nb)
    $.ui.status(
      s.sp
        ? `${nb.key} ${s.sp.id} ${s.done}/${s.total}p${s.blocked.length ? ` ⚠${s.blocked.length}` : ''}`
        : `${nb.key} doing ${s.doing.length}`,
    )
    return nb
  } catch {
    return undefined // a half-written file: the next poll picks up the finished one
  }
}

async function runCli($: EngineInterface, args: string[]): Promise<string> {
  const r = await $.process.run(['node', '.pm/pm.mjs', ...args], { cwd: root, timeoutMs: 15000 })
  return (r.exitCode === 0 ? r.stdout : r.stderr).trim().split('\n')[0]?.trim() ?? ''
}

export const register: Register = on => {
  let poll: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gdev-board', description: 'Show the gdev product board (sprint, backlog, bugs, roadmap)' })
    const first = await loadBoard($, true)
    await update($, board, () => first ?? null)
    poll?.cancel()
    poll = $.clock.every(3000, async () => {
      const nb = await loadBoard($, false)
      if (nb !== undefined) await update($, board, () => nb)
    })
    if (first) void $.ui.open({ id: PANE, title: 'gdev board', placement: 'widget' } as any)

    return next(e)
  })

  on('command.run', { command: 'gdev-board' }, async $ => {
    const nb = await loadBoard($, true)
    await update($, board, () => nb ?? null)
    if (!nb) return { text: 'No .pm/board.json in this project — run /gdev:setup first.' }
    await $.ui.open({ id: PANE, title: 'gdev board' })

    return { text: 'gdev board opened.' }
  })

  // ---------- band above the prompt ----------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, board)
    if (!b || e.props.hasSurvey || (await read($, isBandHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = summary(b)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color="claude">◆ {b.key}</Text>
        {s.sp ? (
          <Text>
            {s.sp.id} {bar(s.done, s.total, 8)} {s.done}/{s.total}p · {daysLeft(s.sp.end)}d
          </Text>
        ) : (
          <Text dimColor>no sprint</Text>
        )}
        {s.doing.length > 0 && <Text dimColor>· doing {s.doing.map(i => i.id).join(', ')}</Text>}
        {s.blocked.length > 0 && <Text color="warning">· ⚠ {s.blocked.length} blocked</Text>}
        {s.critical.length > 0 && <Text color="error">· 🐞 {s.critical.length} critical</Text>}
        <Button key="open" label="Board" plain onPress={() => $.ui.open({ id: PANE, title: 'gdev board' })} />
        <Button key="hide" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  // ---------- the board pane ----------
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const b = await read($, board)
    if (!b) return <Text dimColor>No gdev board in this project. Run /gdev:setup.</Text>
    const s = summary(b)
    const stored = await read($, view)
    const v: GdevView = ['sprint', 'backlog', 'bugs', 'roadmap'].includes(stored) ? stored : 'sprint'
    const msg = await read($, notice)
    const width = e.props.bodyColumns ?? 60

    const header = (
      <Box flexDirection="column">
        <Text weight="bold">
          {b.name} <Text dimColor>[{b.key}]</Text>
        </Text>
        {s.sp ? (
          <Text>
            {s.sp.id} “{s.sp.goal}” {bar(s.done, s.total)} {s.done}/{s.total}p · {daysLeft(s.sp.end)}d left
          </Text>
        ) : (
          <Text dimColor>No active sprint — /gdev:sprint plan</Text>
        )}
        {s.doing.length > b.wip && <Text color="warning">WIP {s.doing.length}/{b.wip} — finish before starting</Text>}
      </Box>
    )

    // compact glance when minimised to a widget
    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column">
          {header}
          {s.doing.slice(0, 2).map(i => (
            <Box key={`w-${i.id}`}>
              <Text wrap="truncate-end">
                ▶ {i.id} {i.title}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const tab = (id: GdevView, label: string) => (
      <Button key={`tab-${id}`} label={label} variant={v === id ? 'primary' : 'secondary'} onPress={() => update($, view, () => id)} />
    )

    const itemRow = (i: GdevItem) => {
      const deferred = i.horizon === 'later'
      // a deferred item is not a candidate for the next step: no "→ ready"
      const nxt = deferred && i.status === 'backlog' ? undefined : FLOW[i.status]
      return (
        <Box key={i.id} flexDirection="row" gap={1} alignItems="center">
          <Text color={i.prio === 'P0' ? 'error' : i.prio === 'P1' ? 'warning' : 'subtle'} mono>
            {i.id}
          </Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end" dimColor={i.status === 'done'}>
              {i.type === 'bug' ? '🐞 ' : i.type === 'spike' ? '🔍 ' : ''}
              {i.title}
              {i.points != null ? <Text dimColor> {i.points}p</Text> : null}
              {i.type === 'bug' ? <Text dimColor> {i.prio}</Text> : null}
              {deferred ? <Text dimColor> · later</Text> : null}
              {i.blocked ? <Text color="warning"> ⚠ {i.blocked}</Text> : null}
            </Text>
          </Box>
          {i.status === 'ready' && (
            <Button key={`b-${i.id}`} label="Build" plain onPress={() => $.prompt.submit({ text: `/gdev:build ${i.id}` } as any)} />
          )}
          {i.status === 'backlog' && (
            <Button key={`r-${i.id}`} label="Refine" plain onPress={() => $.prompt.submit({ text: `/gdev:refine ${i.id}` } as any)} />
          )}
          {nxt && <Button key={`m-${i.id}`} label={`→ ${nxt}`} plain onPress={async () => {
              const t = await runCli($, ['move', i.id, nxt])
              await update($, notice, () => t)
              const nb = await loadBoard($, true)
              if (nb !== undefined) await update($, board, () => nb)
            }} />}
        </Box>
      )
    }

    const section = (title: string, its: GdevItem[], limit = 12) =>
      its.length === 0 ? null : (
        <Box key={`s-${title}`} flexDirection="column" marginTop={1}>
          <Text weight="semibold">
            {title} <Text dimColor>({its.length} · {pts(its)}p)</Text>
          </Text>
          {its.sort(byPrio).slice(0, limit).map(itemRow)}
          {its.length > limit && <Text dimColor>… {its.length - limit} more (node .pm/pm.mjs ls)</Text>}
        </Box>
      )

    const work = b.items.filter(i => i.type !== 'epic' && i.status !== 'dropped')
    let body
    if (v === 'sprint') {
      const scope = s.sp ? work.filter(i => i.sprint === s.sp!.id) : work.filter(i => ['doing', 'review', 'ready'].includes(i.status))
      body = COLUMNS.map(c => section(c.toUpperCase(), scope.filter(i => i.status === c), c === 'done' ? 5 : 12))
    } else if (v === 'backlog') {
      const epics = b.items.filter(i => i.type === 'epic' && !['done', 'dropped'].includes(i.status))
      body = [
        ...epics.map(ep => section(`${ep.id} ${ep.title}`, work.filter(i => i.epic === ep.id && ['backlog', 'ready', 'idea'].includes(i.status)), 8)),
        section('No epic', work.filter(i => !i.epic && ['backlog', 'ready', 'idea'].includes(i.status) && i.type !== 'bug'), 8),
      ]
    } else if (v === 'bugs') {
      const bugs = work.filter(i => i.type === 'bug' && i.status !== 'done')
      const active = bugs.filter(i => i.horizon !== 'later')
      body = [
        ...['S1', 'S2', 'S3', 'S4', ''].map(sev =>
          section(sev ? `Severity ${sev}` : 'Untriaged', active.filter(i => (i.severity ?? '') === sev)),
        ),
        // deferred bugs (horizon "later") go last, whatever their severity
        section('Deferred (later)', bugs.filter(i => i.horizon === 'later')),
      ]
    } else {
      // never name a variable `h`: it is the JSX factory
      body = (['now', 'next', 'later', 'shipped'] as const).map(horizon => {
        const rs = b.roadmap.filter(r => r.horizon === horizon)
        if (!rs.length) return null
        return (
          <Box key={`h-${horizon}`} flexDirection="column" marginTop={1}>
            <Text weight="semibold">{horizon.toUpperCase()}</Text>
            {rs.map(r => {
              const kids = r.epic ? work.filter(i => i.epic === r.epic) : []
              const d = kids.filter(i => i.status === 'done').length
              return (
                <Box key={`r-${r.id}`}>
                  <Text wrap="truncate-end">
                    <Text dimColor>{r.id}</Text> {r.title}
                    {kids.length ? <Text dimColor> {bar(d, kids.length, 6)} {d}/{kids.length}</Text> : null}
                    {r.goal ? <Text dimColor> — {r.goal}</Text> : null}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )
      })
    }
    const EMPTY: Record<GdevView, string> = {
      sprint: 'Nothing in this sprint yet — /gdev:sprint plan',
      backlog: 'Backlog is empty — /gdev:stories or /gdev:plan',
      bugs: 'No open bugs.',
      roadmap: 'Roadmap is empty — /gdev:plan roadmap add <title>',
    }
    if (!(body as unknown[]).some(Boolean)) {
      body = (
        <Box key="empty" marginTop={1}>
          <Text dimColor>{EMPTY[v] ?? ''}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={width}>
        {header}
        <Box flexDirection="row" gap={1} marginTop={1} flexWrap="wrap">
          {tab('sprint', 'Sprint')}
          {tab('backlog', 'Backlog')}
          {tab('bugs', 'Bugs')}
          {tab('roadmap', 'Roadmap')}
        </Box>
        {body}
        <Box flexDirection="row" gap={1} marginTop={1} flexWrap="wrap">
          <Button key="a-status" label="Sync & status" plain onPress={async () => {
              const t = await runCli($, ['sync'])
              await update($, notice, () => t)
              const nb = await loadBoard($, true)
              if (nb !== undefined) await update($, board, () => nb)
            }} />
          <Button key="a-next" label="Next task" plain onPress={() => $.prompt.submit({ text: '/gdev:build next' } as any)} />
          <Button key="a-bug" label="Report bug" plain onPress={() => $.prompt.submit({ text: '/gdev:bug ' } as any)} />
          <Button key="a-plan" label="Plan sprint" plain onPress={() => $.prompt.submit({ text: '/gdev:sprint plan' } as any)} />
        </Box>
        {msg ? <Text dimColor>{msg}</Text> : null}
      </Box>
    )
  })
}

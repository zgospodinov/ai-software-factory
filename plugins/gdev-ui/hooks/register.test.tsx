import { expect, test } from 'claude-code/testing'

const BOARD = {
  version: 1,
  meta: { seq: 3 },
  roadmap: [{ id: 'R-1', title: 'Accounts MVP', horizon: 'now', epic: 'DEM-1' }],
  sprints: [{ id: 'SP-1', goal: 'Accounts', start: '2026-11-20', end: '2099-12-03', status: 'active' }],
  items: [
    { id: 'DEM-1', type: 'epic', title: 'User accounts', status: 'doing', prio: 'P1' },
    { id: 'DEM-2', type: 'story', title: 'Sign up with email', status: 'doing', prio: 'P1', points: 3, epic: 'DEM-1', sprint: 'SP-1' },
    { id: 'DEM-3', type: 'bug', title: 'Login button misaligned', status: 'ready', prio: 'P0', points: 1, severity: 'S1', sprint: 'SP-1' },
    { id: 'DEM-4', type: 'bug', title: 'Report shows zero savings', status: 'backlog', prio: 'P3', points: 8, severity: 'S2', horizon: 'later' },
  ],
}
const CFG = { name: 'Demo', key: 'DEM', wip: 2 }

const PANE = {
  plugin: 'gdev-ui',
  component: 'Pane',
  requestId: 'gdev-board',
  props: {
    title: 'gdev board',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane shows the active sprint and its items', async ($, on) => {
  on('command.register', () => ({ value: { command: 'gdev-board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', (_, e) => ({ value: String(e.path).split('\\').join('/') === 'C:/proj/.pm/board.json' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1, isLink: false } }))
  on('fs.read', (_, e) => ({ value: JSON.stringify(String(e.path ?? e).endsWith('config.json') ? CFG : BOARD) }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /SP-1/ }))?.text).toContain('0/4p')
  expect(await ui.find({ type: 'Text', text: /Sign up with email/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'b-DEM-3' })).toBeTruthy()
  await ui.unmount()
})

test('no board: the pane says how to set one up', async ($, on) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toContain('/gdev:setup')
  await ui.unmount()
})

test('every tab draws, and the tabs stay to switch back', async ($, on) => {
  on('command.register', () => ({ value: { command: 'gdev-board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', (_, e) => ({ value: String(e.path).split('\\').join('/') === 'C:/proj/.pm/board.json' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1, isLink: false } }))
  on('fs.read', (_, e) => ({ value: JSON.stringify(String(e.path).endsWith('config.json') ? CFG : BOARD) }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-roadmap' })
  expect(await ui.find({ type: 'Text', text: /Accounts MVP/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'tab-sprint' })).toBeTruthy()
  await ui.press({ key: 'tab-bugs' })
  expect(await ui.find({ type: 'Text', text: /Login button misaligned/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Severity S2/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Deferred \(later\)/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Report shows zero savings/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'm-DEM-4' })).toBeFalsy()
  await ui.press({ key: 'tab-backlog' })
  expect(await ui.find({ type: 'Button', key: 'tab-roadmap' })).toBeTruthy()
  await ui.press({ key: 'tab-sprint' })
  expect(await ui.find({ type: 'Text', text: /Sign up with email/ })).toBeTruthy()
  await ui.unmount()
})

test('the widget glance draws', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('fs.exists', (_, e) => ({ value: String(e.path).split('\\').join('/') === 'C:/proj/.pm/board.json' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1, isLink: false } }))
  on('fs.read', (_, e) => ({ value: JSON.stringify(String(e.path).endsWith('config.json') ? CFG : BOARD) }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'gdev-board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'widget' }, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /DEM-2/ })).toBeTruthy()
  await ui.unmount()
})

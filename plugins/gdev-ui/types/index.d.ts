export type GdevItem = {
  id: string
  type: 'epic' | 'story' | 'bug' | 'spike' | 'chore'
  title: string
  status: 'idea' | 'backlog' | 'ready' | 'doing' | 'review' | 'done' | 'dropped'
  prio: string
  points?: number
  epic?: string
  sprint?: string
  severity?: string
  blocked?: string
  rank?: number
  horizon?: 'now' | 'next' | 'later'
}
export type GdevSprint = { id: string; goal: string; start: string; end: string; status: 'planned' | 'active' | 'closed'; velocity?: number }
export type GdevRoadmap = { id: string; title: string; horizon: 'now' | 'next' | 'later' | 'shipped'; epic?: string; goal?: string }
export type GdevBoard = {
  root: string
  name: string
  key: string
  wip: number
  items: GdevItem[]
  sprints: GdevSprint[]
  roadmap: GdevRoadmap[]
}
export type GdevView = 'sprint' | 'backlog' | 'bugs' | 'roadmap'

declare module 'claude-code' {
  interface PluginState {
    'gdev-ui': {
      board: Shaped<GdevBoard | null>
      view: GdevView
      isBandHidden: boolean
      notice: string
    }
  }
}

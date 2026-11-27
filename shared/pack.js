import * as pt1 from './packs/it2406_pt1.js'
import * as lab05_1 from './packs/it2406_05_lab1.js'
import * as pt06_1 from './packs/it2406_06_pt1.js'
import * as lab07_1 from './packs/it2406_07_lab1.js'
import * as lab07_2 from './packs/it2406_07_lab2.js'
import * as pt07_1 from './packs/it2406_07_pt1.js'

export const SAP_HOST = 'm53p.ucc.cloud'
export const SAP_HOST_FALLBACK = 'm42p.ucc.cloud'
export const SAP_CLIENT = '236'
export const SAP_SYSTEM = 'M53'
export const DEFAULT_PACK_ID = 'it2406_pt1'

export const PACKS = {
  [pt1.PACK_META.id]: pt1,
  [lab05_1.PACK_META.id]: lab05_1,
  [pt06_1.PACK_META.id]: pt06_1,
  [lab07_1.PACK_META.id]: lab07_1,
  [lab07_2.PACK_META.id]: lab07_2,
  [pt07_1.PACK_META.id]: pt07_1
}

export const PACK_LIST = Object.values(PACKS).map((p) => ({
  ...p.PACK_META,
  taskCount: p.TASKS.length,
  tasks: p.TASKS.map(({ id, title, role, area, txn, shot }) => ({ id, title, role, area, txn, shot }))
}))

export const getPack = (packId) => PACKS[packId || DEFAULT_PACK_ID] || PACKS[DEFAULT_PACK_ID]

export const suffixOf = (sapUser) => {
  const m = String(sapUser || '').toUpperCase().match(/^LEARN-(\d{3})$/)
  return m ? m[1] : null
}

// Backwards-compatible exports for original Ultralight Bike PT1
export const RELATIONSHIPS = pt1.RELATIONSHIPS
export const ACTIVITIES = pt1.ACTIVITIES
export const WBS = pt1.WBS
export const MILESTONES = pt1.MILESTONES
export const TASKS = pt1.TASKS
export const dataFor = (sfx, packId = DEFAULT_PACK_ID) => getPack(packId).dataFor(sfx)

export const planFor = (sapUser, taskIds, packId = DEFAULT_PACK_ID) => {
  const sfx = suffixOf(sapUser)
  if (!sfx) throw new Error('SAP user must look like LEARN-###')
  const pack = getPack(packId)
  const d = pack.dataFor(sfx)
  const ids = (taskIds && taskIds.length ? taskIds : pack.TASKS.map((t) => t.id)).map(Number)
  const steps = []
  for (const t of pack.TASKS.filter((t) => ids.includes(t.id))) {
    t.steps(d).forEach((s, i) => steps.push({
      ...s,
      label: s.label || (s.op === 'shot' ? `Screenshot: ${s.caption}` : s.op),
      task: t.id,
      idx: steps.length,
      key: `${t.id}.${i + 1}`
    }))
  }
  return {
    packId: pack.PACK_META.id,
    pack: pack.PACK_META,
    entry: pack.PACK_META.entry || 'webgui',
    data: d,
    steps
  }
}

export const taskList = (packId = DEFAULT_PACK_ID) =>
  getPack(packId).TASKS.map(({ id, title, role, area, txn, shot }) => ({ id, title, role, area, txn, shot }))

export const taskSummary = taskList

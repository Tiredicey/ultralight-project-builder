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
export const PREDECESSORS = pt1.PREDECESSORS
export const FLAG_PATTERNS = pt1.FLAG_PATTERNS
export const MILESTONES = pt1.MILESTONES
export const TASKS = pt1.TASKS
export const CHECKS = pt1.CHECKS

export const dataFor = (sfx, packId = DEFAULT_PACK_ID) => getPack(packId).dataFor(sfx)

export const planFor = (sapUser, taskIds, packId = DEFAULT_PACK_ID) => {
  const sfx = suffixOf(sapUser)
  if (!sfx) throw new Error(`Invalid SAP user ${sapUser} (expected LEARN-###)`)
  const pack = getPack(packId)
  const d = pack.dataFor(sfx)
  const wanted = taskIds?.length ? new Set(taskIds.map(Number)) : null
  const tasks = pack.TASKS.filter((t) => !wanted || wanted.has(t.id)).map((t) => ({
    id: t.id, title: t.title, role: t.role, area: t.area, txn: t.txn, shot: t.shot,
    steps: t.steps(d).map((s, i) => ({ key: `${t.id}.${i + 1}`, task: t.id, ...s }))
  }))
  return {
    packId: pack.PACK_META.id,
    pack: pack.PACK_META,
    sapUser: sapUser.toUpperCase(),
    data: d,
    tasks,
    steps: tasks.flatMap((t) => t.steps)
  }
}

export const taskSummary = (packId = DEFAULT_PACK_ID) =>
  getPack(packId).TASKS.map(({ id, title, role, area, txn, shot }) => ({ id, title, role, area, txn, shot }))

export const taskSheet = (sapUser, packId = DEFAULT_PACK_ID) => {
  const pack = getPack(packId)
  if (typeof pack.taskSheet === 'function') return pack.taskSheet(sapUser)
  const plan = planFor(sapUser, null, pack.PACK_META.id)
  return {
    sapUser: plan.sapUser,
    packId: pack.PACK_META.id,
    data: plan.data,
    tasks: plan.tasks.map((t) => ({
      id: t.id, title: t.title, role: t.role, area: t.area, txn: t.txn, shot: t.shot,
      values: [], check: ''
    }))
  }
}

export const validatePlan = (sapUser, taskIds, packId = DEFAULT_PACK_ID) => {
  const pack = getPack(packId)
  if (typeof pack.validatePlan === 'function') return pack.validatePlan(sapUser, taskIds)
  return planFor(sapUser, taskIds, pack.PACK_META.id)
}

import { Doc } from './docx.js'
import { conclusion, conclusionIndex, CONCLUSION_COUNT } from './conclusions.js'

export const FIGURES = [
  { name: 't1-wbs-responsibilities', task: 1, tcode: 'CJ20N', title: 'WBS elements and responsible cost centres', what: (d) => `Responsibilities tab: ${d.project} and ${d.project}-1 to -5, controlling area ${d.controllingArea}` },
  { name: 't2-activity-overview', task: 2, tcode: 'CJ20N', title: 'Activity overview', what: () => 'Activities 0010 to 0140 with duration, work, work centre and WBS assignment' },
  { name: 't3-network-before', task: 3, tcode: 'Project Network Graph', title: 'Network graph before relationships', prefer: 'first', what: () => 'All activities side by side, no links yet' },
  { name: 't5-network-after', task: 5, tcode: 'Project Network Graph', title: 'Network graph after relationships', what: () => '22 finish-to-start relationships from 0010 through 0140' },
  { name: 't8-costs-planned', task: 8, tcode: 'S_ALR_87013542', title: 'Planned cost report', prefer: 'first', what: () => 'Plan, commitments and actuals after release, before Task 10' },
  { name: 't9-structure', task: 9, tcode: 'CN41N', title: 'Structure overview', what: (d) => `${d.project}, ${d.psText}, network and WBS P/2${d.suffix}-1 to -5` },
  { name: 't11-confirmation', task: 11, tcode: 'CN25', title: 'Confirmation of activity 0010', what: () => '35 h actual of 80 h, 45 h remaining, partial confirmation' },
  { name: 't12-costs-after-confirmation', task: 12, tcode: 'S_ALR_87013542', title: 'Cost report after confirmation', what: () => 'Actual 1,750.00 EUR on 8000000 Labor' },
  { name: 't14-costs-final', task: 14, tcode: 'S_ALR_87013542', title: 'Final cost report', what: () => 'Actual 11,450.00 EUR: 1,750.00 labour plus 9,700.00 supplier invoice' }
]

const TASK_TITLES = { 1: 'Create project and WBS', 2: 'Activities, external processing, primary costs', 3: 'Network graph before relationships', 4: 'Create 22 relationships', 5: 'Network graph after relationships', 6: 'PS text and milestones', 7: 'Release project', 8: 'Planned cost report', 9: 'Structure overview', 10: 'Primary cost 8,000 EUR flexible', 11: 'Confirm 35 h on 0010', 12: 'Cost report after confirmation', 13: 'Supplier invoice 9,700 EUR', 14: 'Final cost report' }
const TCODE = { 1: 'CJ20N', 2: 'CJ20N', 3: 'Network Graph', 4: 'CJ20N', 5: 'Network Graph', 6: 'CJ20N', 7: 'CJ20N', 8: 'S_ALR_87013542', 9: 'CN41N', 10: 'CJ20N', 11: 'CN25', 12: 'S_ALR_87013542', 13: 'FB60', 14: 'S_ALR_87013542' }

const stamp = (t) => (t ? new Date(t).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '')
const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function pickFigures(sub) {
  const out = {}
  for (const f of FIGURES) {
    const all = sub.evidence.filter((x) => x.name === f.name && x.flag !== 'skipped' && x.flag !== 'state')
    const ordered = f.prefer === 'first' ? [...all].reverse() : all
    const e = ordered.find((x) => !x.flag) || ordered[0]
    out[f.name] = e ? { ...e, url: `/api/jobs/${e.job_id}/evidence/${e.id}` } : null
    if (!e) { const bad = sub.evidence.find((x) => x.name === f.name); if (bad) out[f.name] = null, out[`${f.name}:why`] = bad.flagNote }
  }
  return out
}

export function taskStatus(sub) {
  const res = {}
  for (let t = 1; t <= 14; t++) {
    const v = sub.checks.find((c) => c.step_key === `${t}.v`)
    const steps = sub.checks.filter((c) => c.step_key.split('.')[0] === String(t) && c.step_key !== `${t}.v`)
    const failed = steps.find((c) => c.level === 'error')
    const ok = steps.find((c) => c.level === 'ok')
    if (v && (!ok || v.created_at >= ok.created_at)) res[t] = { state: v.level === 'ok' ? 'Verified in SAP' : v.level === 'warn' ? 'Check screenshot' : 'Not verified', note: v.message, at: v.created_at, job: v.job_id }
    else if (ok && (!failed || ok.created_at >= failed.created_at)) res[t] = { state: 'Done by runner', note: ok.message, at: ok.created_at, job: ok.job_id }
    else if (failed) res[t] = { state: 'Failed', note: failed.message, at: failed.created_at, job: failed.job_id }
    else res[t] = { state: 'No record', note: 'No run has touched this task yet', at: null, job: null }
  }
  return res
}

async function imageBytes(src) {
  const blob = src instanceof Blob ? src : await (await fetch(src, { credentials: 'same-origin' })).blob()
  const bmp = await createImageBitmap(blob)
  let bytes, ext = 'jpeg'
  if (/jpe?g/.test(blob.type)) bytes = new Uint8Array(await blob.arrayBuffer())
  else {
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    bytes = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', .9))).arrayBuffer())
  }
  const r = { bytes, ext, w: bmp.width, h: bmp.height }
  bmp.close?.()
  return r
}

export async function buildSubmission(sub, opts = {}, onProgress = () => {}) {
  const d = sub.data
  const variant = Number.isInteger(opts.variant) ? opts.variant : conclusionIndex(d.suffix)
  const figs = pickFigures(sub)
  const status = taskStatus(sub)
  const doc = new Doc()
  const student = opts.student || sub.user?.name || ''
  const section = opts.section || ''

  doc.title('IT2406 Performance Task 1')
  doc.p('SAP PS and FI: Development of Ultralight Bike', { style: 'Subtitle' })
  doc.table(['Item', 'Value'], [
    ['Student', student || '(enter your name)'],
    ['Section', section || '(enter your section)'],
    ['SAP user', d.sapUser],
    ['SAP system / client', `M53 / ${sub.sap.client} (${sub.sap.host})`],
    ['Project definition', `${d.project}, ${d.projectText}`],
    ['Supplier', d.supplier],
    ['PS text', d.psText],
    ['Package generated', stamp(sub.generatedAt)]
  ], [2600, 6760])

  doc.h('Task summary', 1)
  doc.p('Status comes from the newest run that touched each task: a Validate read-back from SAP where one exists, otherwise the runner step result.', { i: true, size: 18, color: '4B5563' })
  doc.table(['#', 'Task', 'Transaction', 'Status', 'Recorded', 'Run'], Object.entries(status).map(([t, s]) => [t, TASK_TITLES[t], TCODE[t], s.state, stamp(s.at), s.job ? `#${s.job}` : '']), [420, 3000, 1500, 1640, 2000, 800])

  doc.h('Screenshots', 1)
  let n = 0, i = 0
  for (const f of FIGURES) {
    i++
    onProgress(`Adding figure ${i} of ${FIGURES.length}`)
    const override = opts.overrides?.[f.name]
    const ev = figs[f.name]
    doc.h(`Task ${f.task}: ${f.title}`, 2)
    if (!override && !ev) { doc.p(figs[`${f.name}:why`] ? `Screenshot not available: ${figs[`${f.name}:why`]}. Attach your own image before exporting.` : `Screenshot not captured yet. Run Task ${f.task} in Autopilot or Assist, or attach your own image before exporting.`, { b: true, color: '9B3434' }); continue }
    try {
      const img = await imageBytes(override || ev.url)
      doc.image(img.bytes, 'jpeg', img.w, img.h)
      n++
      const when = override ? `attached by you, ${stamp(override.lastModified)}` : `captured ${stamp(ev.created_at)}, run #${ev.job_id}`
      doc.p(`Figure ${n}. ${f.tcode}. ${f.what(d)}. (${when})`, { style: 'Caption' })
      if (!override && ev.flag) doc.p(`Note: ${ev.flagNote}.`, { i: true, size: 18, color: '8A5A14', center: true })
    } catch (e) { doc.p(`Screenshot could not be loaded: ${e.message}`, { b: true, color: '9B3434' }) }
  }

  onProgress('Adding task tables')
  doc.h('Task data', 1)
  doc.h('Task 1: WBS elements', 2)
  doc.table(['Level', 'WBS element', 'Description', 'Resp. cost centre'], d.wbs.map((w) => [String(w.level), w.wbs, w.desc, w.costCenter]), [900, 2200, 4060, 2200])
  doc.h('Task 2: Activities', 2)
  doc.table(['Activity', 'Description', 'Duration (days)', 'Work (h)', 'Work centre', 'WBS'], d.activities.map((a) => [a.act, a.desc, a.dur, a.work, a.wc, a.wbs]), [900, 3160, 1300, 1000, 1400, 1600])
  doc.table(['Special activity', 'Content'], [[`${d.external.act} ${d.external.desc}`, d.external.lines.map((l) => `${l.line} ${l.text} ${money(l.price)} EUR`).join('; ')], [`${d.primCost.act} ${d.primCost.desc}`, `${money(d.primCost.amount)} EUR on ${d.primCost.costElem}, changed to 8,000.00 EUR flexible in Task 10`]], [3400, 5960])
  doc.h('Task 4: Relationships (finish-to-start)', 2)
  const pairs = d.relationships.map((r) => `${r.from} → ${r.to}`)
  const rows = []; for (let k = 0; k < pairs.length; k += 4) rows.push([pairs[k] || '', pairs[k + 1] || '', pairs[k + 2] || '', pairs[k + 3] || ''])
  doc.table(['Link', 'Link', 'Link', 'Link'], rows)
  doc.h('Task 6: PS text and milestones', 2)
  doc.table(['Item', 'Value'], [['PS text', d.psText], ...d.milestones.map((m) => [`Milestone on ${m.act}`, `${m.desc}, usage ${m.usage}, trend and progress analysis, offset to finish`])], [2600, 6760])
  doc.h('Tasks 11 and 13: postings', 2)
  doc.table(['Posting', 'Value'], [
    ['Confirmation (CN25)', `Activity ${d.confirmation.act}: ${d.confirmation.actual} h of ${d.confirmation.planned} h, ${d.confirmation.remaining} h remaining`],
    ['Supplier invoice (FB60)', `Supplier ${d.invoice.supplier}, ${money(d.invoice.amount)} EUR, G/L ${d.invoice.gl}, tax ${d.invoice.tax}, activity ${d.invoice.act}, text "${d.invoice.text}"`],
    ['Expected actual after Task 11', `${money(d.expected.actualAfterConfirmation)} EUR`],
    ['Expected actual after Task 13', `${money(d.expected.actualAfterInvoice)} EUR`]
  ], [2600, 6760])

  onProgress('Writing conclusion')
  doc.h('Conclusion', 1)
  doc.table(['Cost element', 'Plan, Task 8', 'Plan, Task 12', 'Actual, Task 12', 'Actual, Task 14'], [
    ['6300000 Other operating expenses (activity 0135)', '10,000.00', '8,000.00', '0.00', '9,700.00'],
    ['8000000 Labor', 'unchanged', 'unchanged', '1,750.00', '1,750.00'],
    ['All cost elements', 'Task 8 total', 'Task 8 total − 2,000.00', '1,750.00', '11,450.00']
  ], [3160, 1500, 1700, 1500, 1500])
  for (const s of conclusion(d, variant)) doc.p(s)
  doc.p(`Conclusion variant ${variant + 1} of ${CONCLUSION_COUNT} for ${d.sapUser}.`, { i: true, size: 16, color: '9CA3AF' })

  onProgress('Packing the Word file')
  return doc.build({ title: `IT2406 PT1 ${d.sapUser} ${d.project}`, author: student || 'Ultralight Project Builder', footer: `${d.sapUser} · ${d.project} · IT2406 Performance Task 1` })
}

export const fileName = (d) => `IT2406_PT1_${d.sapUser}_${d.project.replace('/', '')}.docx`

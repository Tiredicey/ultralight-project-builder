export const SAP_HOST = 'm53p.ucc.cloud'
export const SAP_CLIENT = '236'
export const SAP_SYSTEM = 'M53'

export const suffixOf = (sapUser) => {
  const m = String(sapUser || '').toUpperCase().match(/^LEARN-(\d{3})$/)
  return m ? m[1] : null
}

export const RELATIONSHIPS = [
  ['0010', '0020'], ['0010', '0030'], ['0010', '0040'], ['0010', '0045'],
  ['0020', '0050'], ['0030', '0060'], ['0040', '0070'], ['0045', '0070'],
  ['0050', '0070'], ['0060', '0070'],
  ['0070', '0080'], ['0070', '0090'], ['0070', '0100'], ['0070', '0110'],
  ['0080', '0120'], ['0090', '0120'], ['0100', '0120'], ['0110', '0120'],
  ['0120', '0130'], ['0120', '0135'], ['0130', '0140'], ['0135', '0140']
]

export const ACTIVITIES = [
  ['0010', 'General concept', 10, 80, 'DVLP1000', ''],
  ['0020', 'Engineering of carbon frame', 5, 40, 'DVLP1000', '-1'],
  ['0030', 'Engineering of steering fork', 2, 20, 'DVLP1000', '-1'],
  ['0040', 'Purchasing of components', 1, 5, 'PROC1000', '-2'],
  ['0050', 'Production of carbon frame', 2, 30, 'ASSY1000', '-2'],
  ['0060', 'Production of steering fork', 1, 10, 'ASSY1000', '-2'],
  ['0070', 'Prototype assembly', 8, 60, 'ASSY1000', '-2'],
  ['0080', 'Wind channel test', 1, 8, 'INSP1000', '-3'],
  ['0090', 'Stiffness test', 1, 6, 'INSP1000', '-3'],
  ['0100', 'Testing acceleration dynamics', 1, 5, 'INSP1000', '-3'],
  ['0110', 'Testing steering precision', 1, 8, 'INSP1000', '-3'],
  ['0120', 'Small series production', 10, 100, 'ASSY1000', '-4'],
  ['0130', 'Final test (internal)', 5, 50, 'INSP1000', '-5'],
  ['0140', 'Release to mass production', 1, 3, 'INSP1000', '-5']
]

export const WBS = [
  ['1', '', 'Development of Ultralight Bike', 'EURD1000'],
  ['2', '-1', 'Engineering', 'EURD1000'],
  ['2', '-2', 'Prototype', 'EURD1000'],
  ['2', '-3', 'Testing', 'EUQM1000'],
  ['2', '-4', 'Small series production', 'EUPR1000'],
  ['2', '-5', 'Release to mass production', 'EUQM1000']
]

export const PREDECESSORS = RELATIONSHIPS.reduce((m, [from, to]) => { (m[to] = m[to] || []).push(from); return m }, {})

export const FLAG_PATTERNS = ['trend analysis', 'progress analysis', 'Reference for offset']

export const MILESTONES = [
  ['0070', '00004', 'Completion: prototype'],
  ['0120', '00005', 'Completion: small series'],
  ['0140', '00006', 'Completion: release']
]

export const dataFor = (sfx) => {
  const P = `P/2${sfx}`
  return {
    suffix: sfx,
    sapUser: `LEARN-${sfx}`,
    project: P,
    projectText: `Development of Ultralight Bike ${sfx} (I)`,
    profile: 'DE01000',
    controllingArea: 'EU00',
    companyCode: 'DE00',
    supplier: `114${sfx}`,
    psText: `PH-${sfx}-1`,
    invoiceText: `Invoice for performance testing ${sfx}`,
    wbs: WBS.map(([level, s, desc, cc]) => ({ level, wbs: P + s, desc, pe: true, acct: true, costCenter: cc })),
    activities: ACTIVITIES.map(([act, desc, dur, work, wc, s]) => ({ act, desc, dur: String(dur), work: String(work), wc, wbs: P + s })),
    external: { act: '0045', desc: 'Outsourcing gear', lines: [{ line: '10', text: 'Engineering', qty: '1', unit: 'EA', price: '2000' }, { line: '20', text: 'Ext. production', qty: '1', unit: 'EA', price: '3000' }] },
    primCost: { act: '0135', desc: 'Performance test by professional drivers', amount: '10000', costElem: '6300000' },
    relationships: RELATIONSHIPS.map(([from, to]) => ({ from, to, type: 'FS' })),
    milestones: MILESTONES.map(([act, usage, desc]) => ({ act, usage, desc, trend: true, progress: true, offsetToFinish: true })),
    confirmation: { act: '0010', actual: '35', planned: '80', remaining: '45' },
    invoice: { supplier: `114${sfx}`, amount: '9700', gl: '6300000', tax: 'A0', act: '0135', text: `Invoice for performance testing ${sfx}` },
    expected: { actualAfterConfirmation: 1750, actualAfterInvoice: 11450 }
  }
}

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Create project and WBS', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CJ20N', label: 'Open Project Builder' }),
      S({ op: 'recipe', name: 'createProject', args: { project: d.project, text: d.projectText, profile: d.profile }, label: `Create ${d.project} "${d.projectText}" with profile ${d.profile}`, values: { 'Project def.': d.project, Text: d.projectText, 'Project Profile': d.profile } }),
      S({ op: 'recipe', name: 'wbsElements', args: { rows: d.wbs }, label: `WBS ${d.project} to ${d.project}-5 with PE, Acct and responsible cost centres`, values: Object.fromEntries(d.wbs.map((w) => [w.wbs, `${w.desc} · ${w.costCenter}`])) }),
      S({ op: 'shot', name: 't1-wbs-responsibilities', caption: `Task 1: WBS elements ${d.project} to ${d.project}-5 with controlling area ${d.controllingArea}` }),
      S({ op: 'save', label: 'Save project', expect: 'saved|created|changed' })
    ]
  },
  {
    id: 2, title: 'Activities, external processing, primary costs', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: true,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'overview', node: d.project, button: ['Activity Overview'], label: 'Activity Overview on top WBS' }),
      S({ op: 'tab', names: ['Int. Processing', 'Internal Processing'], optional: true, label: 'Internal processing tab' }),
      S({ op: 'grid', label: 'Enter 14 activities', columns: { act: ['Activity'], desc: ['Description', 'Operation short text'], dur: ['Normal dur', 'Normal duration', 'Duration'], work: ['Work'], wc: ['Work center', 'Work Center'] }, fallback: { act: 1, desc: 2, dur: 3, work: 5, wc: 7 }, rows: d.activities.map(({ act, desc, dur, work, wc }) => ({ act, desc, dur, work, wc })) }),
      S({ op: 'key', key: 'Enter', label: 'Confirm activities' }),
      S({ op: 'grid', label: 'Assign activities to WBS', columns: { wbs: ['WBS element', 'WBS Element'] }, fallback: { wbs: 22 }, match: { key: 'act', columns: ['Activity'] }, rows: d.activities.map(({ act, wbs }) => ({ act, wbs })) }),
      S({ op: 'key', key: 'Enter', label: 'Confirm WBS assignment' }),
      S({ op: 'shot', name: 't2-activity-overview', caption: 'Task 2: Activity Overview, activities 0010 to 0140 with duration, work, work centre and WBS' }),
      S({ op: 'save', label: 'Save activities', expect: 'saved|being changed|changed' }),
      S({ op: 'openProject', project: d.project, label: `Reopen ${d.project}` }),
      S({ op: 'recipe', name: 'extService', args: { act: d.external.act, desc: d.external.desc, lines: d.external.lines }, label: `External activity ${d.external.act} with service lines 10 and 20`, values: { Activity: '0045', Description: d.external.desc, 'Line 10': 'Engineering 1 EA 2000', 'Line 20': 'Ext. production 1 EA 3000' } }),
      S({ op: 'tab', names: ['Prim. Costs', 'Primary Costs'], label: 'Primary costs tab' }),
      S({ op: 'grid', label: 'Primary cost 0135', columns: { act: ['Activity'], desc: ['Description'], amount: ['Amount'], ce: ['Cost Elem', 'Cost Element'] }, fallback: { act: 1, desc: 2, amount: 3, ce: 5 }, rows: [{ act: d.primCost.act, desc: d.primCost.desc, amount: d.primCost.amount, ce: d.primCost.costElem }] }),
      S({ op: 'key', key: 'Enter', label: 'Confirm primary cost' }),
      S({ op: 'save', label: 'Save project', expect: 'saved|changed' })
    ]
  },
  {
    id: 3, title: 'Network graph before relationships', role: 'Production Manager', area: 'PS', txn: 'ProjectNetworkGraph', shot: true,
    steps: (d) => [
      S({ op: 'recipe', name: 'networkGraph', args: { project: d.project, min: 14 }, label: `Project Network Graph app, project ${d.project}`, values: { 'Project Definition': d.project } }),
      S({ op: 'shot', name: 't3-network-before', caption: 'Task 3: Network before relationships, all activities start together' })
    ]
  },
  {
    id: 4, title: 'Create 22 relationships', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      ...[['0020', '0030', '0040', '0045', '0050', '0060', '0070'], ['0080', '0090', '0100', '0110', '0120', '0130', '0135', '0140']].flatMap((batch, bi) => [
        S({ op: 'openProject', project: d.project, label: `Open ${d.project} (batch ${bi + 1})` }),
        ...batch.map((act) => S({ op: 'recipe', name: 'relationsPred', args: { act, preds: PREDECESSORS[act] }, label: `${act} predecessors ${PREDECESSORS[act].join(', ')}` })),
        S({ op: 'save', label: `Save relationships batch ${bi + 1}`, expect: 'saved|being changed|changed' })
      ])
    ]
  },
  {
    id: 5, title: 'Network graph after relationships', role: 'Production Manager', area: 'PS', txn: 'ProjectNetworkGraph', shot: true,
    steps: (d) => [
      S({ op: 'recipe', name: 'networkGraph', args: { project: d.project, min: 16 }, label: `Project Network Graph app, project ${d.project}, 0010 fans out to 0020, 0030, 0040, 0045`, values: { 'Project Definition': d.project } }),
      S({ op: 'shot', name: 't5-network-after', caption: 'Task 5: Network graph after 22 finish-to-start relationships' })
    ]
  },
  {
    id: 6, title: 'PS text and milestones', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'recipe', name: 'psText', args: { wbs: d.project, st: '01', desc: d.psText, lang: 'DE', body: `Functional specification ultralight racing bike ${d.suffix}` }, label: `PS text ${d.psText}, type 01, language DE` }),
      S({ op: 'save', label: 'Save PS text', expect: 'saved|being changed|changed' }),
      ...d.milestones.flatMap((m) => [
        S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
        S({ op: 'recipe', name: 'milestone', args: { act: m.act, usage: m.usage, desc: m.desc, flags: FLAG_PATTERNS }, label: `Milestone ${m.usage} ${m.desc} on ${m.act} with trend, progress, offset flags`, values: { Usage: m.usage, Description: m.desc } }),
        S({ op: 'save', label: `Save milestone ${m.usage}`, expect: 'saved|being changed|changed' })
      ])
    ]
  },
  {
    id: 7, title: 'Release project', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'recipe', name: 'treeSelect', args: { ident: d.project, level: 0 }, label: `Select project definition ${d.project}` }),
      S({ op: 'menu', path: ['Edit', 'Status', 'Release'], label: 'Edit > Status > Release' }),
      S({ op: 'expect', statusbar: 'status|set|released', label: 'Status message' }),
      S({ op: 'save', label: 'Save', expect: 'saved|being changed|changed' }),
      S({ op: 'openProject', project: d.project, label: 'Reopen to verify status' }),
      S({ op: 'expectField', titles: ['System Status'], contains: 'REL', label: 'System status contains REL' })
    ]
  },
  {
    id: 8, title: 'Planned cost report', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Project costs Act/Comm/Total/Plan' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile GL01000' }),
      S({ op: 'recipe', name: 'costReport', args: { project: d.project, coArea: d.controllingArea }, label: 'Selection and execute' }),
      S({ op: 'shot', name: 't8-costs-planned', caption: 'Task 8: Planned costs after release' })
    ]
  },
  {
    id: 9, title: 'Structure overview', role: 'Shop Floor Worker', area: 'PS', txn: 'CN41N', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CN41N', label: 'Structure Overview' }),
      S({ op: 'popupField', titles: ['PS info profile', 'PS Info Profile'], value: 'GL01000', optional: true, label: 'PS info profile GL01000' }),
      S({ op: 'fill', fields: [[['Project definition', 'Project'], d.project]], label: 'Selection' }),
      S({ op: 'key', key: 'F8', label: 'Execute' }),
      S({ op: 'shot', name: 't9-structure', caption: `Task 9: Structure overview of ${d.project}` })
    ]
  },
  {
    id: 10, title: 'Primary cost 8,000 EUR flexible', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'recipe', name: 'activityFields', args: { act: d.primCost.act, fields: [[['Costs in the activity', 'Amount'], '8000']], checks: ['flexible duration'] }, label: 'Activity 0135: costs 8000, flexible duration' }),
      S({ op: 'save', label: 'Save', expect: 'saved|being changed|changed' })
    ]
  },
  {
    id: 11, title: 'Confirm 35 h on 0010', role: 'AR Accountant', area: 'PS', txn: 'CN25', shot: true,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Read network number of ${d.project}` }),
      S({ op: 'txn', code: 'CN25', label: 'Confirm network activity' }),
      S({ op: 'recipe', name: 'confirmActivity', args: { act: d.confirmation.act, actual: d.confirmation.actual, remaining: d.confirmation.remaining }, label: 'Actual work 35 h, partial confirmation, dates cleared, remaining 45 h' }),
      S({ op: 'shot', name: 't11-confirmation', caption: 'Task 11: Actual work 35 of 80 hours, remaining 45 hours' }),
      S({ op: 'recipe', name: 'confirmSave', label: 'Save confirmation' })
    ]
  },
  {
    id: 12, title: 'Cost report after confirmation', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Cost report' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile' }),
      S({ op: 'recipe', name: 'costReport', args: { project: d.project, coArea: d.controllingArea, expectActual: 1750 }, label: 'Execute, expect actual 1,750.00 EUR' }),
      S({ op: 'shot', name: 't12-costs-after-confirmation', caption: 'Task 12: Actual costs 1,750.00 EUR after confirmation' })
    ]
  },
  {
    id: 13, title: 'Supplier invoice 9,700 EUR', role: 'AR Accountant', area: 'FI', txn: 'FB60', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Read network number of ${d.project}` }),
      S({ op: 'txn', code: 'FB60', label: 'Enter incoming invoice' }),
      S({ op: 'recipe', name: 'supplierInvoice', args: { companyCode: d.companyCode, supplier: d.invoice.supplier, amount: d.invoice.amount, text: d.invoice.text, gl: d.invoice.gl, tax: d.invoice.tax, act: d.invoice.act }, label: `Invoice ${d.invoice.supplier} ${d.invoice.amount} EUR on G/L ${d.invoice.gl}, network activity ${d.invoice.act}`, values: { Supplier: d.invoice.supplier, Amount: d.invoice.amount, Text: d.invoice.text, 'G/L': d.invoice.gl, 'Tax code': d.invoice.tax, Activity: d.invoice.act } }),
      S({ op: 'save', label: 'Post', expect: 'Document \\d+ was posted|posted' })
    ]
  },
  {
    id: 14, title: 'Final cost report', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Cost report' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile' }),
      S({ op: 'recipe', name: 'costReport', args: { project: d.project, coArea: d.controllingArea, expectActual: 11450 }, label: 'Execute, expect actual 11,450.00 EUR (1,750 + 9,700)' }),
      S({ op: 'shot', name: 't14-costs-final', caption: 'Task 14: Actual costs after supplier invoice' })
    ]
  }
]

export const planFor = (sapUser, taskIds) => {
  const sfx = suffixOf(sapUser)
  if (!sfx) throw new Error('SAP user must look like LEARN-###')
  const d = dataFor(sfx)
  const ids = (taskIds && taskIds.length ? taskIds : TASKS.map((t) => t.id)).map(Number)
  const steps = []
  for (const t of TASKS.filter((t) => ids.includes(t.id))) {
    t.steps(d).forEach((s, i) => steps.push({ ...s, label: s.label || (s.op === 'shot' ? `Screenshot: ${s.caption}` : s.op), task: t.id, idx: steps.length, key: `${t.id}.${i + 1}` }))
  }
  return { data: d, steps }
}

export const taskSummary = () => TASKS.map(({ id, title, role, area, txn, shot }) => ({ id, title, role, area, txn, shot }))

// What a correct result looks like in SAP, per task. Used by the task sheet ("how to check") and by
// the runner's read-only validate op, which runs the listed check ids and reports pass/fail per task.
export const CHECKS = {
  1: { how: (d) => `CJ20N, open ${d.project}: tree shows ${d.project} and ${d.project}-1 to -5. Responsibilities tab shows the cost centres, controlling area ${d.controllingArea}.`, ids: ['wbs'] },
  2: { how: () => 'Tree under the network shows activities 0010 to 0140, plus 0045 (external) and 0135 (primary cost). 0045 has service lines 10 and 20.', ids: ['activities'] },
  3: { how: () => 'Screenshot only. Network graph before relationships: activities side by side with no links.', ids: [], evidenceOnly: true },
  4: { how: () => 'Relationship Overview on each successor shows its predecessors, 22 finish-to-start links in total (0070 and 0120 have four each).', ids: ['rels'] },
  5: { how: () => 'Screenshot only. Network graph after relationships: 0010 fans out to 0020, 0030, 0040, 0045.', ids: [], evidenceOnly: true },
  6: { how: (d) => `PS text ${d.psText} under ${d.project}. Milestones 00004, 00005, 00006 under 0070, 0120, 0140.`, ids: ['pstext', 'milestones'] },
  7: { how: () => 'Project definition Basic Data: System Status contains REL.', ids: ['release'] },
  8: { how: () => 'S_ALR_87013542 runs with plan values for the project.', ids: ['reportRuns'] },
  9: { how: (d) => `CN41N shows the structure of ${d.project}. Screenshot for the report.`, ids: [], evidenceOnly: true },
  10: { how: () => 'Activity 0135: Costs in the activity 8,000.00 and Flexible duration ticked. Report plan line 6300000 shows 8,000.00.', ids: ['task10', 'plan8000'] },
  11: { how: () => 'Confirmation on 0010: 35 h actual, 45 h remaining. Report actual 8000000 Labor 1,750.00.', ids: ['labor'] },
  12: { how: () => 'Cost report: actual 1,750.00 EUR after the confirmation.', ids: ['labor'] },
  13: { how: (d) => `FB60 document for supplier ${d.supplier}, 9,700.00 EUR on activity 0135. Report actual 6300000 shows 9,700.00.`, ids: ['invoice'] },
  14: { how: () => 'Cost report: all cost elements actual 11,450.00 EUR (1,750 + 9,700).', ids: ['finalActual'] }
}

// Printable task sheet: every value the pack types, per task, plus how to check it by hand.
export const taskSheet = (sapUser) => {
  const sfx = suffixOf(sapUser)
  if (!sfx) throw new Error('SAP user must look like LEARN-###')
  const d = dataFor(sfx)
  return {
    sapUser: `LEARN-${sfx}`, project: d.project, data: d,
    tasks: TASKS.map((t) => ({
      id: t.id, title: t.title, role: t.role, area: t.area, txn: t.txn, shot: t.shot,
      how: CHECKS[t.id].how(d), checkIds: CHECKS[t.id].ids, evidenceOnly: !!CHECKS[t.id].evidenceOnly,
      steps: t.steps(d).map((s, i) => ({ key: `${t.id}.${i + 1}`, op: s.op, label: s.label || (s.op === 'shot' ? `Screenshot: ${s.caption}` : s.op), instruction: s.instruction || null, values: sheetValues(s) }))
    }))
  }
}

const sheetValues = (s) => {
  if (s.values) return s.values
  if (s.rows) return { rows: s.rows.map((r) => Object.values(r).map((v) => (v === true ? 'X' : v)).join(' · ')) }
  if (s.fields) return Object.fromEntries(s.fields.map(([l, v]) => [l[0], v]))
  if (s.value) return { [s.titles?.[0] || 'Value']: s.value }
  if (s.op === 'recipe' && s.args) {
    const a = s.args
    if (s.name === 'relationsPred') return { Activity: a.act, Predecessors: a.preds.join(', '), Type: 'FS' }
    if (s.name === 'psText') return { WBS: a.wbs, 'Text type': a.st, Description: a.desc, Language: a.lang }
    if (s.name === 'milestone') return { Activity: a.act, Usage: a.usage, Description: a.desc, Flags: 'trend, progress, offset to finish' }
    if (s.name === 'costReport') return { Project: a.project, 'CO area': a.coArea, ...(a.expect ? { Expect: a.expect } : {}) }
    if (s.name === 'confirmActivity') return { Activity: a.act, 'Actual work': `${a.actual} h`, Remaining: `${a.remaining} h` }
    if (s.name === 'activityFields') return { Activity: a.act, Costs: '8000', 'Flexible duration': 'ticked' }
  }
  if (s.op === 'shot') return { Screenshot: s.name }
  if (s.op === 'txn') return { Transaction: s.code }
  return null
}

// Plan for a read-only validate job: login, then one validate step per selected task.
export const validatePlan = (sapUser, taskIds) => {
  const sfx = suffixOf(sapUser)
  if (!sfx) throw new Error('SAP user must look like LEARN-###')
  const d = dataFor(sfx)
  const ids = (taskIds && taskIds.length ? taskIds : TASKS.map((t) => t.id)).map(Number)
  const steps = TASKS.filter((t) => ids.includes(t.id)).map((t, idx) => ({ op: 'validate', task: t.id, checks: CHECKS[t.id].ids, evidenceOnly: !!CHECKS[t.id].evidenceOnly, label: `Check task ${t.id}: ${t.title}`, key: `${t.id}.v`, idx }))
  return { data: d, steps, validate: true }
}

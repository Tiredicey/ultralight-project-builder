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
      S({ op: 'dismiss', label: 'Close optional start-up popups', buttons: ['Continue', 'Cancel'] }),
      S({ op: 'manual', label: 'User-specific options', instruction: 'If "Project Builder: Options" appears choose the options button, set Hierarchy levels 99, tick Preview last project and confirm.', optional: true }),
      S({ op: 'manual', label: 'Create project definition', instruction: `Create > Project. Project def. ${d.project}, Text "${d.projectText}", Project Profile ${d.profile} Cost projects (Europe), press Enter, then open the WBS Element Overview.`, values: { 'Project def.': d.project, Text: d.projectText, 'Project Profile': d.profile } }),
      S({ op: 'grid', label: 'Fill WBS elements', columns: { level: ['Lev', 'Level'], wbs: ['WBS Element', 'WBS element'], desc: ['Description'], pe: ['PE', 'Planning Element'], acct: ['Acct', 'Account Assignment'] }, rows: d.wbs.map((w) => ({ level: w.level, wbs: w.wbs, desc: w.desc, pe: w.pe, acct: w.acct })) }),
      S({ op: 'key', key: 'Enter', label: 'Confirm WBS rows' }),
      S({ op: 'tab', names: ['Responsibilities'], label: 'Open Responsibilities tab' }),
      S({ op: 'grid', label: 'Responsible cost centres', columns: { cc: ['Resp. cost cntr', 'Resp.cost cntr', 'Responsible Cost Center'] }, match: { key: 'wbs', columns: ['WBS Element', 'WBS element'] }, rows: d.wbs.map((w) => ({ wbs: w.wbs, cc: w.costCenter })) }),
      S({ op: 'key', key: 'Enter', label: 'Confirm cost centres (EU00 is derived)' }),
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
      S({ op: 'tab', names: ['External Processing', 'Ext. Processing'], label: 'External processing tab' }),
      S({ op: 'manual', label: 'Activity 0045 with service', instruction: `Row 1: Activity ${d.external.act}, tick Service, Description "${d.external.desc}", press Enter. In Service Specification enter line 10 Engineering 1 EA 2000 and line 20 Ext. production 1 EA 3000, press Enter, then Back once.`, values: { Activity: '0045', Description: d.external.desc, 'Line 10': 'Engineering 1 EA 2000', 'Line 20': 'Ext. production 1 EA 3000' } }),
      S({ op: 'tab', names: ['Prim. Costs', 'Primary Costs'], label: 'Primary costs tab' }),
      S({ op: 'grid', label: 'Primary cost 0135', columns: { act: ['Activity'], desc: ['Description'], amount: ['Amount'], ce: ['Cost Elem', 'Cost Element'] }, fallback: { act: 1, desc: 2, amount: 3, ce: 5 }, rows: [{ act: d.primCost.act, desc: d.primCost.desc, amount: d.primCost.amount, ce: d.primCost.costElem }] }),
      S({ op: 'key', key: 'Enter', label: 'Confirm primary cost' }),
      S({ op: 'save', label: 'Save project', expect: 'saved|changed' })
    ]
  },
  {
    id: 3, title: 'Network graph before relationships', role: 'Production Manager', area: 'PS', txn: 'CJ2B', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CJ2B', label: 'Project planning board' }),
      S({ op: 'manual', label: 'Load network', instruction: `Enter project ${d.project} and open the network graphic. The Fiori "Project Network Graph" app was not assigned to automation sessions in earlier runs.`, values: { 'Project Definition': d.project } }),
      S({ op: 'shot', name: 't3-network-before', caption: 'Task 3: Network before relationships, all activities start together' })
    ]
  },
  {
    id: 4, title: 'Create 22 relationships', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      ...['0010', '0020', '0030', '0040', '0045', '0050', '0060', '0070', '0080', '0090', '0100', '0110', '0120', '0130', '0135'].flatMap((from) => {
        const succ = d.relationships.filter((r) => r.from === from).map((r) => r.to)
        return [
          S({ op: 'overview', node: from, button: ['Relationship Overview'], label: `Relationships of ${from}` }),
          S({ op: 'grid', label: `${from} successors ${succ.join(', ')}`, columns: { act: ['Activity'], scs: ['Scs', 'Successor'] }, append: true, rows: succ.map((to) => ({ act: to, scs: true })) }),
          S({ op: 'key', key: 'Enter', label: 'Confirm relationships' })
        ]
      }),
      S({ op: 'save', label: 'Save relationships', expect: 'saved|changed' })
    ]
  },
  {
    id: 5, title: 'Network graph after relationships', role: 'Production Manager', area: 'PS', txn: 'CJ2B', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CJ2B', label: 'Project planning board' }),
      S({ op: 'manual', label: 'Load network', instruction: `Open ${d.project}. Activity 0010 must show four successors (0020, 0030, 0040, 0045). Fit to window before capture.`, values: { 'Project Definition': d.project } }),
      S({ op: 'shot', name: 't5-network-after', caption: 'Task 5: Network graph after 22 finish-to-start relationships' })
    ]
  },
  {
    id: 6, title: 'PS text and milestones', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'overview', node: d.project, button: ['PS Text Overview'], label: 'PS Text Overview' }),
      S({ op: 'grid', label: `PS text ${d.psText}`, columns: { st: ['ST', 'Text type'], desc: ['Description'], lang: ['TT', 'Language'] }, rows: [{ st: '01', desc: d.psText, lang: 'DE' }] }),
      S({ op: 'key', key: 'Enter', label: 'Confirm PS text' }),
      S({ op: 'manual', label: 'Write PS text body', instruction: 'Type any text into the editor and press Back to return to the Project Builder.', optional: true }),
      ...d.milestones.flatMap((m) => [
        S({ op: 'overview', node: m.act, button: ['Milestone Overview'], label: `Milestone overview on ${m.act}` }),
        S({ op: 'grid', label: `Milestone ${m.usage}`, columns: { usage: ['Usage'], desc: ['Description'] }, rows: [{ usage: m.usage, desc: m.desc }] }),
        S({ op: 'key', key: 'Enter', label: 'Confirm milestone' }),
        S({ op: 'manual', label: `Milestone ${m.usage} flags`, instruction: `Open the milestone below activity ${m.act} in the tree, tick Trend analysis, Progress analysis and Offset to fin., press Enter.`, values: { Usage: m.usage, Description: m.desc } })
      ]),
      S({ op: 'save', label: 'Save', expect: 'saved|changed' })
    ]
  },
  {
    id: 7, title: 'Release project', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'menu', path: ['Edit', 'Status', 'Release'], label: 'Edit > Status > Release' }),
      S({ op: 'expect', statusbar: 'status|set|released', label: 'Status message' }),
      S({ op: 'save', label: 'Save', expect: 'saved|changed' })
    ]
  },
  {
    id: 8, title: 'Planned cost report', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Project costs Act/Comm/Total/Plan' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile GL01000' }),
      S({ op: 'fill', fields: [[['Controlling Area'], d.controllingArea], [['Project'], d.project], [['Plan Version'], '0'], [['From fiscal year'], '{YEAR}'], [['To fiscal year'], '{YEAR+1}'], [['From period'], '1'], [['To period'], '12']], label: 'Selection' }),
      S({ op: 'key', key: 'F8', label: 'Execute' }),
      S({ op: 'shot', name: 't8-costs-planned', caption: 'Task 8: Planned costs after release' })
    ]
  },
  {
    id: 9, title: 'Structure overview', role: 'Shop Floor Worker', area: 'PS', txn: 'CN41N', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CN41N', label: 'Structure Overview' }),
      S({ op: 'popupField', titles: ['PS info profile', 'PS Info Profile'], value: 'GL01000', optional: true, label: 'PS info profile GL01000' }),
      S({ op: 'fill', fields: [[['Project'], d.project]], label: 'Selection' }),
      S({ op: 'key', key: 'F8', label: 'Execute' }),
      S({ op: 'shot', name: 't9-structure', caption: `Task 9: Structure overview of ${d.project}` })
    ]
  },
  {
    id: 10, title: 'Primary cost 8,000 EUR flexible', role: 'Production Manager', area: 'PS', txn: 'CJ20N', shot: false,
    steps: (d) => [
      S({ op: 'openProject', project: d.project, label: `Open ${d.project}` }),
      S({ op: 'node', text: ['Performance test', d.primCost.act], label: 'Select activity 0135' }),
      S({ op: 'fill', fields: [[['Amount'], '8000']], label: 'Amount 8000' }),
      S({ op: 'check', titles: ['Flexible'], label: 'Tick Flexible' }),
      S({ op: 'key', key: 'Enter', label: 'Confirm' }),
      S({ op: 'save', label: 'Save', expect: 'saved|changed' })
    ]
  },
  {
    id: 11, title: 'Confirm 35 h on 0010', role: 'AR Accountant', area: 'PS', txn: 'CN25', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'CN25', label: 'Confirm network activity' }),
      S({ op: 'manual', label: 'Select activity', instruction: `Enter the network of ${d.project} (search by project) and activity ${d.confirmation.act}, press Enter.`, values: { Project: d.project, Activity: d.confirmation.act } }),
      S({ op: 'fill', fields: [[['Actual work', 'Actual Work'], d.confirmation.actual]], label: 'Actual work 35' }),
      S({ op: 'clear', titles: ['Actual start', 'Actual finish', 'Act. start', 'Act. finish'], optional: true, label: 'Clear actual dates' }),
      S({ op: 'key', key: 'Enter', label: 'Determine remaining work' }),
      S({ op: 'expectField', titles: ['Remaining work', 'Remaining Work'], value: '45', label: 'Remaining 45 h' }),
      S({ op: 'shot', name: 't11-confirmation', caption: 'Task 11: Actual work 35 of 80 hours, remaining 45 hours' }),
      S({ op: 'save', label: 'Save confirmation', expect: 'confirm|saved' })
    ]
  },
  {
    id: 12, title: 'Cost report after confirmation', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Cost report' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile' }),
      S({ op: 'fill', fields: [[['Controlling Area'], d.controllingArea], [['Project'], d.project], [['Plan Version'], '0'], [['From fiscal year'], '{YEAR}'], [['To fiscal year'], '{YEAR+1}'], [['From period'], '1'], [['To period'], '12']], label: 'Selection' }),
      S({ op: 'key', key: 'F8', label: 'Execute' }),
      S({ op: 'expectText', text: '1,750.00', label: 'Actual 1,750.00 EUR' }),
      S({ op: 'shot', name: 't12-costs-after-confirmation', caption: 'Task 12: Actual costs 1,750.00 EUR after confirmation' })
    ]
  },
  {
    id: 13, title: 'Supplier invoice 9,700 EUR', role: 'AR Accountant', area: 'FI', txn: 'FB60', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'FB60', label: 'Enter incoming invoice' }),
      S({ op: 'popupField', titles: ['Company Code'], value: d.companyCode, optional: true, label: 'Company code DE00' }),
      S({ op: 'fill', fields: [[['Vendor', 'Supplier'], d.invoice.supplier], [['Invoice date'], '{TODAY}'], [['Amount'], d.invoice.amount], [['Text'], d.invoice.text]], label: 'Header' }),
      S({ op: 'check', titles: ['Calculate tax', 'Calculate Tax'], optional: true, label: 'Calculate tax' }),
      S({ op: 'grid', label: 'G/L line', columns: { gl: ['G/L acct', 'G/L Account'], amt: ['Amount in doc.curr.', 'Amount'], tax: ['Tax code', 'Tax Code'] }, rows: [{ gl: d.invoice.gl, amt: '*', tax: d.invoice.tax }] }),
      S({ op: 'manual', label: 'Network and activity', instruction: `Scroll right to the Network column, F4 > Networks for a Project Definition > ${d.project}, pick the network, set Activity ${d.invoice.act}, press Enter until the balance is 0.00.`, values: { 'Project Definition': d.project, Activity: d.invoice.act } }),
      S({ op: 'save', label: 'Post', expect: 'Document \\d+ was posted|posted' })
    ]
  },
  {
    id: 14, title: 'Final cost report', role: 'Controller', area: 'CO', txn: 'S_ALR_87013542', shot: true,
    steps: (d) => [
      S({ op: 'txn', code: 'S_ALR_87013542', label: 'Cost report' }),
      S({ op: 'popupField', titles: ['Database Profile', 'Database prof'], value: 'GL01000', optional: true, label: 'Database profile' }),
      S({ op: 'fill', fields: [[['Controlling Area'], d.controllingArea], [['Project'], d.project], [['Plan Version'], '0'], [['From fiscal year'], '{YEAR}'], [['To fiscal year'], '{YEAR+1}'], [['From period'], '1'], [['To period'], '12']], label: 'Selection' }),
      S({ op: 'key', key: 'F8', label: 'Execute' }),
      S({ op: 'expectText', text: '9,700.00', label: 'Invoice 9,700.00 EUR visible' }),
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

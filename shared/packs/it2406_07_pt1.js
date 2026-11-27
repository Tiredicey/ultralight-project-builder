export const PACK_META = {
  id: 'it2406_07_pt1',
  code: '07 PT 1',
  title: 'QM Performance Task: Receipt Inspection, Defects & Stock Release',
  shortTitle: 'QM Performance Task (07 PT1)',
  module: 'QM / MM',
  entry: 'flp',
  screenshots: 3,
  description: 'End-to-end QM receipt inspection case study: goods receipt lot generation, defect recording, usage decision, and unrestricted stock release.'
}

export const dataFor = (sfx) => ({
  suffix: sfx,
  sapUser: `LEARN-${sfx}`,
  material: `ORWN1${sfx}`,
  plant: 'DL00',
  storLoc: 'FG00',
  qty: '10'
})

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Verify Receipt Inspection Lot', role: 'Quality Inspector', area: 'QM', txn: 'QA32', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Inspection Lots', label: 'Open Manage Inspection Lots' }),
      S({ op: 'manual', label: 'Locate inspection lot', instruction: `Filter Material ${d.material} in Plant ${d.plant} and open the active inspection lot.`, values: { Material: d.material, Plant: d.plant } }),
      S({ op: 'captureVar', varName: 'lotNumber', pattern: 'Inspection Lot\\s+(\\d{8,14})', optional: true, label: 'Capture Lot #' }),
      S({ op: 'shot', name: 'qm-pt1-t1-lot', caption: `Task 1: Active Inspection Lot for ${d.material}` })
    ]
  },
  {
    id: 2, title: 'Record Inspection Results & Defects', role: 'Quality Inspector', area: 'QM', txn: 'QE51N', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Record Inspection Results', label: 'Open Record Inspection Results' }),
      S({ op: 'manual', label: 'Record results & defect notes', instruction: `Open Lot {lotNumber}, enter inspection measurements/codes, record any nonconforming items, and valuate.`, values: { Lot: '{lotNumber}', Material: d.material } }),
      S({ op: 'shot', name: 'qm-pt1-t2-results', caption: `Task 2: Recorded Inspection Results & Valuation for ${d.material}` })
    ]
  },
  {
    id: 3, title: 'Usage Decision & Stock Posting', role: 'Quality Manager', area: 'QM', txn: 'QA11', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Usage Decision', label: 'Open Manage Usage Decision' }),
      S({ op: 'manual', label: 'Post Usage Decision & Release Stock', instruction: `Open Lot {lotNumber}, record Usage Decision (Accept / Unrestricted-Use Stock), verify stock posting tab, and Save.`, values: { Lot: '{lotNumber}', 'Stock Posting': 'Unrestricted Use' } }),
      S({ op: 'shot', name: 'qm-pt1-t3-ud', caption: `Task 3: Usage Decision & Stock Release for ${d.material}` })
    ]
  }
]

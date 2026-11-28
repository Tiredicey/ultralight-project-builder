export const PACK_META = {
  id: 'it2406_05_lab1',
  code: '05 Lab 1',
  title: 'Enterprise Asset Management (EAM): Malfunction & Maintenance Order',
  shortTitle: 'EAM Malfunction Order',
  module: 'EAM / PM',
  entry: 'flp',
  screenshots: 4,
  description: 'Report circulation fan malfunction, create/release maintenance order, post goods issue, confirm jobs, settle costs (KO88), and review equipment history.'
}

export const dataFor = (sfx) => ({
  suffix: sfx,
  sapUser: `LEARN-${sfx}`,
  techObjSearch: `*${sfx}`,
  techObjId: `10000${sfx}`,
  description: `Circulation fan defective ${sfx}`,
  longText: 'Circulation fan does not work correctly, Exchange filter.',
  effect: 'Production Restricted (2)',
  workCenter: 'MANT1000',
  plant: 'DL00',
  storLoc: 'MI00',
  partSearch: `FLTR1*${sfx}`,
  controllingArea: 'NA00',
  workItems: [
    { workCenter: 'MANT1000/DL00', desc: 'Exchange filter immediately', effort: '2', unit: 'H', assignee: '' },
    { workCenter: 'MANT1000/DL00', desc: 'Functional test', effort: '15', unit: 'MIN', assignee: `LEARN-${sfx}` }
  ]
})

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Create Malfunction Report & Maintenance Order', role: 'Shop Floor Worker', area: 'EAM', txn: 'FLP: Manage Malfunction Report', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Malfunction Report', label: 'Open Manage Malfunction Report' }),
      S({ op: 'manual', label: 'Create malfunction report & order', instruction: `Select Technical Object "${d.techObjSearch}" (Shop Floor -> Circulation Fan). Description: "${d.description}". Long text: "${d.longText}". Effect: ${d.effect}. Add Work Item 1 (MANT1000/DL00, Exchange filter immediately, 2 H) and Work Item 2 (MANT1000/DL00, Functional test, 15 MIN, Assign to ${d.sapUser}). Save order, then add Part "${d.partSearch}" (Plant ${d.plant}, Stor Loc ${d.storLoc}, Qty 1) and Save.`, values: { 'Technical Object': d.techObjSearch, Description: d.description, 'Long Text': d.longText, Effect: d.effect, 'Work Item 1': 'MANT1000/DL00 · Exchange filter immediately · 2 H', 'Work Item 2': `MANT1000/DL00 · Functional test · 15 MIN · ${d.sapUser}`, Part: `${d.partSearch} · ${d.plant}/${d.storLoc} · Qty 1` } }),
      S({ op: 'captureVar', varName: 'orderNumber', pattern: 'Order\\s+(\\d{6,12})', optional: true, label: 'Capture Maintenance Order #' })
    ]
  },
  {
    id: 2, title: 'Release Maintenance Order', role: 'Production Manager', area: 'EAM', txn: 'FLP: Manage Malfunction Reports', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Malfunction Reports', label: 'Open Manage Malfunction Reports' }),
      S({ op: 'manual', label: 'Release order', instruction: `Filter by Processed By "${d.sapUser}", open order {orderNumber}, and click Release.`, values: { 'Processed By': d.sapUser, Order: '{orderNumber}' } })
    ]
  },
  {
    id: 3, title: 'Post Goods Issue (MIGO)', role: 'Maintenance Worker', area: 'MM', txn: 'MIGO', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Post Goods Movement', label: 'Open Post Goods Movement (MIGO)' }),
      S({ op: 'manual', label: 'Post Goods Issue for Order', instruction: `Select Goods Issue -> Order "{orderNumber}". Tick Item OK and click Post.`, values: { Action: 'Goods Issue', Reference: 'Order', Order: '{orderNumber}' } }),
      S({ op: 'captureVar', varName: 'matDoc', pattern: 'Material document\\s+(\\d{8,12})', optional: true, label: 'Capture Material Document #' })
    ]
  },
  {
    id: 4, title: 'Confirm Order & Technical Completion', role: 'Maintenance Worker', area: 'EAM', txn: 'FLP: Repair Malfunctions', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Repair Malfunctions', label: 'Open Repair Malfunctions - My Job List' }),
      S({ op: 'manual', label: 'Confirm jobs & Technically Complete', instruction: `Filter Assigned to ${d.sapUser}. Job 1: Status "Work is done", Actual 2 H, Final Confirmation. Job 2: Status "Work is done", Actual 15 MIN, Final Confirmation. Open Order Overview and set Technically Complete.`, values: { Assigned: d.sapUser, 'Job 1': '2 H · Final Confirmation', 'Job 2': '15 MIN · Final Confirmation', Status: 'Technically Completed' } }),
      S({ op: 'shot', name: 'eam-t4-teco', caption: 'Task 4: Maintenance Order status showing Technically Completed' })
    ]
  },
  {
    id: 5, title: 'Analyze Final Costs', role: 'Production Manager', area: 'EAM', txn: 'FLP: Find Maintenance Orders', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Find Maintenance Orders', label: 'Open Find Maintenance Orders' }),
      S({ op: 'manual', label: 'Open order Costs tab', instruction: `Search Order "{orderNumber}", open it, and navigate to the Costs tab showing planned vs actual costs.`, values: { Order: '{orderNumber}', Tab: 'Costs' } }),
      S({ op: 'shot', name: 'eam-t5-costs', caption: 'Task 5: Maintenance Order Costs tab (planned vs actual)' })
    ]
  },
  {
    id: 6, title: 'Run Actual Settlement (KO88)', role: 'Production Manager', area: 'CO', txn: 'KO88', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'KO88', label: 'Open Run Actual Settlement (KO88)' }),
      S({ op: 'popupField', titles: ['Controlling Area'], value: d.controllingArea, optional: true, label: 'Controlling Area NA00' }),
      S({ op: 'manual', label: 'Execute actual settlement', instruction: `Enter Order "{orderNumber}", Settlement Period {MONTH}, Fiscal Year {YEAR}, uncheck Test Run, and press Execute (F8).`, values: { 'Controlling Area': d.controllingArea, Order: '{orderNumber}', Period: '{MONTH}', Year: '{YEAR}', 'Test Run': 'Unchecked' } })
    ]
  },
  {
    id: 7, title: 'Complete Order for Business', role: 'Production Manager', area: 'EAM', txn: 'FLP: Find Maintenance Orders', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Find Maintenance Orders', label: 'Open Find Maintenance Orders' }),
      S({ op: 'manual', label: 'Complete (Business)', instruction: `Open Order "{orderNumber}", choose Complete (Business), tick "Complete assigned notifications", and Save.`, values: { Order: '{orderNumber}', Action: 'Complete (Business)', Notifications: 'Complete assigned notifications' } })
    ]
  },
  {
    id: 8, title: 'Review Equipment Order History', role: 'Production Manager', area: 'EAM', txn: 'FLP: Find Maintenance Orders', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Find Maintenance Orders', label: 'Open Find Maintenance Orders' }),
      S({ op: 'manual', label: 'Open Completed Equipment History (Operations)', instruction: `Filter Status "Completed for Business" and Technical Object "${d.techObjId}". Open equipment history and select the Operations tab.`, values: { Status: 'Completed for Business', 'Technical Object': d.techObjId, Tab: 'Operations' } }),
      S({ op: 'shot', name: 'eam-t8-history-ops', caption: 'Task 8: Equipment Order History - Operations tab' }),
      S({ op: 'tab', names: ['Costs'], optional: true, label: 'Switch to Costs tab' }),
      S({ op: 'shot', name: 'eam-t8-history-costs', caption: 'Task 8: Equipment Order History - Costs tab' })
    ]
  }
]

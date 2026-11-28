export const PACK_META = {
  id: 'it2406_07_lab2',
  code: '07 Lab 2',
  title: 'QM in SD & Procurement: End-to-End Inspection Lot & STO',
  shortTitle: 'QM in SD & Procurement',
  module: 'QM / SD / MM',
  entry: 'flp',
  screenshots: 2,
  description: 'Create Customer BP, extend ORWN1### QM view, create Quality Info Record, Inspection Plan, Stock Transport Order, Goods Issue (351), Inspection Results, Usage Decision, and Goods Receipt (101).'
}

export const dataFor = (sfx) => ({
  suffix: sfx,
  sapUser: `LEARN-${sfx}`,
  customerName: `Quality Bikes ${sfx}`,
  material: `ORWN1${sfx}`,
  plantSupply: 'DL00',
  plantRecv: 'SD00',
  storLoc: 'FG00',
  salesOrg: 'UW00',
  distChannel: 'WH',
  division: 'BI',
  companyCode: 'US00',
  purchOrg: 'US00',
  purchGroup: 'N00',
  reconAcct: '1200000',
  qty: '10'
})

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Create Customer Business Partner', role: 'Sales Rep US West', area: 'SD', txn: 'BP', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Business Partner', label: 'Open Manage Business Partner' }),
      S({ op: 'manual', label: 'Create Organization BP', instruction: `Create Organization -> Title: Company (0003), Name: "${d.customerName}", San Diego, CA 92121, US. Add Role FLCU00 (Co Code ${d.companyCode}, Recon ${d.reconAcct}) and Role FLCU01 (Sales Org ${d.salesOrg}, Dist ${d.distChannel}, Div ${d.division}, Sales District US0002, USD, FOB San Diego, Plant ${d.plantRecv}, Tax Exempt 0). Save.`, values: { Name: d.customerName, Roles: 'FLCU00, FLCU01', 'Sales Area': `${d.salesOrg}/${d.distChannel}/${d.division}`, Plant: d.plantRecv } }),
      S({ op: 'captureVar', varName: 'bpNumber', pattern: 'Business Partner\\s+(\\d{5,12})', optional: true, label: 'Capture BP #' })
    ]
  },
  {
    id: 2, title: 'Extend Material Master with QM View', role: 'Warehouse Supervisor', area: 'QM', txn: 'MM01', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'MM01', label: 'Open Create Material (MM01)' }),
      S({ op: 'manual', label: 'Add Quality Management view', instruction: `Material "${d.material}", Industry: Mechanical Engineering. Select Quality Management view for Plant ${d.plantSupply}. Open Insp. Setup, add Inspection Type 02 (Active), uncheck Automatic UD, and Save.`, values: { Material: d.material, Plant: d.plantSupply, 'Insp. Type': '02 (Active, Auto UD off)' } })
    ]
  },
  {
    id: 3, title: 'Create Quality Info Record - Sales', role: 'Warehouse Supervisor', area: 'QM', txn: 'QV51', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Create Quality Info Record', label: 'Open Create Quality Info Record - Sales' }),
      S({ op: 'manual', label: 'Create Quality Info Record', instruction: `Enter Sales Org ${d.salesOrg}, Material ${d.material}, Customer {bpNumber}. Set Inspection to "Before delivery" and Save.`, values: { 'Sales Org': d.salesOrg, Material: d.material, Customer: '{bpNumber}', Inspection: 'Before delivery' } })
    ]
  },
  {
    id: 4, title: 'Create Inspection Plan', role: 'Warehouse Supervisor', area: 'QM', txn: 'QP01', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Inspection Plans', label: 'Open Manage Inspection Plans' }),
      S({ op: 'manual', label: 'Define Inspection Plan', instruction: `Material ${d.material}, Plant ${d.plantSupply}, Usage 6, Status 4, UoM EA. Operation 0010 (Control Key QM01). Add Characteristics: 0010 PACK (Set PACK, Sample 100%-0) and 0020 COLOR (Set COLOR, Sample 100%-0). Save.`, values: { Material: d.material, Plant: d.plantSupply, Usage: '6', Status: '4', Char1: '0010 PACK / 100%-0', Char2: '0020 COLOR / 100%-0' } })
    ]
  },
  {
    id: 5, title: 'Create Stock Transport Order (ME21N)', role: 'Warehouse Employee', area: 'MM', txn: 'ME21N', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'ME21N', label: 'Open Create Purchase Order (ME21N)' }),
      S({ op: 'manual', label: 'Create Stock Transport Order', instruction: `Order Type: Stock Transp. Order, Supplying Plant ${d.plantSupply}, Purch Org ${d.purchOrg}, Purch Group ${d.purchGroup}, Co Code ${d.companyCode}. Line: Material ${d.material}, Qty ${d.qty}, Plant ${d.plantRecv}, Stor Loc ${d.storLoc}. Save.`, values: { 'Order Type': 'UB (Stock Transp. Order)', 'Supplying Plant': d.plantSupply, Material: d.material, Qty: d.qty, 'Receiving Plant': `${d.plantRecv}/${d.storLoc}` } }),
      S({ op: 'captureVar', varName: 'poNumber', pattern: '(?:Order|PO)\\s+(?:number\\s+)?(\\d{8,12})', optional: true, label: 'Capture PO #' })
    ]
  },
  {
    id: 6, title: 'Post Goods Issue for STO (MIGO 351)', role: 'Goods Issue Clerk', area: 'MM', txn: 'MIGO', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'MIGO', label: 'Open Post Goods Movement (MIGO)' }),
      S({ op: 'manual', label: 'Goods Issue 351', instruction: `Select Goods Issue -> Purchase Order {poNumber}, Movement Type 351, Stor Loc ${d.storLoc}. Tick Item OK and Post.`, values: { Action: 'Goods Issue', PO: '{poNumber}', 'Mov Type': '351', 'Stor Loc': d.storLoc } })
    ]
  },
  {
    id: 7, title: 'Display Inspection Lot', role: 'Goods Issue Clerk', area: 'QM', txn: 'QA03', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Inspection Lots', label: 'Open Manage Inspection Lots' }),
      S({ op: 'manual', label: 'Open Inspection Lot for ORWN1', instruction: `Search Material ${d.material} and open the newly generated Inspection Lot details.`, values: { Material: d.material } }),
      S({ op: 'captureVar', varName: 'lotNumber', pattern: 'Inspection Lot\\s+(\\d{8,14})', optional: true, label: 'Capture Inspection Lot #' }),
      S({ op: 'shot', name: 'qm-lab2-t7-lot', caption: `Task 7: Inspection Lot details for ${d.material}` })
    ]
  },
  {
    id: 8, title: 'Record Inspection Results', role: 'Goods Issue Clerk', area: 'QM', txn: 'QE51N', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Record Inspection Results', label: 'Open Record Inspection Results' }),
      S({ op: 'manual', label: 'Record COLOR inspection results', instruction: `Open Lot {lotNumber}. Record Code Group COLOR, Code 4 (Green), Inspected ${d.qty}, Nonconforming 0. Valuate before screenshot, then Save.`, values: { Lot: '{lotNumber}', 'Code Group': 'COLOR', Code: '4 (Green)', Inspected: d.qty, Nonconforming: '0' } }),
      S({ op: 'shot', name: 'qm-lab2-t8-valuated', caption: `Task 8: Inspection Results showing Valuated status for ${d.material}` })
    ]
  },
  {
    id: 9, title: 'Make Usage Decision', role: 'Goods Issue Clerk', area: 'QM', txn: 'QA11', shot: false,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Manage Usage Decision', label: 'Open Manage Usage Decision' }),
      S({ op: 'manual', label: 'Accept Usage Decision', instruction: `Open Lot {lotNumber}, choose UD Code A (Goods issue and Accept), and Save.`, values: { Lot: '{lotNumber}', 'UD Code': 'A (Accept)' } })
    ]
  },
  {
    id: 10, title: 'Create Goods Receipt (MIGO 101)', role: 'Goods Receipt Clerk', area: 'MM', txn: 'MIGO', shot: false,
    steps: (d) => [
      S({ op: 'txn', code: 'MIGO', label: 'Open Post Goods Movement (MIGO)' }),
      S({ op: 'manual', label: 'Goods Receipt 101', instruction: `Select Goods Receipt -> Purchase Order {poNumber}, Movement Type 101, Stor Loc ${d.storLoc}. Tick Item OK and Post.`, values: { Action: 'Goods Receipt', PO: '{poNumber}', 'Mov Type': '101', 'Stor Loc': d.storLoc } })
    ]
  }
]

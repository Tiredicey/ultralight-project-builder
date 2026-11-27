export const PACK_META = {
  id: 'it2406_06_pt1',
  code: '06 PT 1',
  title: 'Formal Business Communication & Customer Support Exchange',
  shortTitle: 'Business Communication (06 PT1)',
  module: 'SD / CS',
  entry: 'flp',
  screenshots: 0,
  description: 'Structured two-part Global Bike customer service communication exchange (Part I: Formal Inquiry/Complaint; Part II: Resolution & RMA Warranty Letter) exported to STI Word format.'
}

export const dataFor = (sfx) => ({
  suffix: sfx,
  sapUser: `LEARN-${sfx}`,
  customerRef: `GBI-CS-${sfx}`,
  rmaNumber: `RMA-2026-${sfx}`,
  product: 'Deluxe Touring Bike (Black) - DXTR1000',
  warrantyPeriod: '24 Months Limited Frame & Component Warranty'
})

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Part I: Formal Customer Inquiry & Complaint Letter', role: 'Customer / Account Rep', area: 'CS', txn: 'DOC', shot: false,
    steps: (d) => [
      S({ op: 'manual', label: 'Verify Part I parameters', instruction: `Review customer reference ${d.customerRef} and product ${d.product} for the formal inquiry/complaint letter, then mark Done to include in the Word report.`, values: { Reference: d.customerRef, Product: d.product, Account: d.sapUser }, optional: true })
    ]
  },
  {
    id: 2, title: 'Part II: Customer Service Resolution & RMA Letter', role: 'Customer Support Manager', area: 'CS', txn: 'DOC', shot: false,
    steps: (d) => [
      S({ op: 'manual', label: 'Verify Part II resolution & RMA', instruction: `Review RMA ${d.rmaNumber} and ${d.warrantyPeriod} resolution terms, then mark Done and download the formatted Word report.`, values: { RMA: d.rmaNumber, Warranty: d.warrantyPeriod, Account: d.sapUser }, optional: true })
    ]
  }
]

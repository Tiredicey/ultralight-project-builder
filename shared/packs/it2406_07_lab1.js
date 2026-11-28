export const PACK_META = {
  id: 'it2406_07_lab1',
  code: '07 Lab 1',
  title: 'Quality Management: Master Inspection Characteristics & Catalogs',
  shortTitle: 'QM Characteristics & Catalogs',
  module: 'QM',
  entry: 'flp',
  screenshots: 2,
  description: 'Inspect Master Inspection Characteristics (PACK, COLOR, WEIGHT, DIMENSION, PRESSURE) in Plant DL00 and Catalog 1 selected sets/codes.'
}

export const dataFor = (sfx) => ({
  suffix: sfx,
  sapUser: `LEARN-${sfx}`,
  plant: 'DL00',
  characteristic: 'PACK',
  catalog: '1',
  selectedSet: '*',
  expectedChars: ['PACK', 'COLOR', 'WEIGHT', 'DIMENSION', 'PRESSURE'],
  expectedCodes: ['1: Damaged', '2: OK', '4: Green']
})

const S = (o) => o

export const TASKS = [
  {
    id: 1, title: 'Task A: Display Master Inspection Characteristics', role: 'Warehouse Supervisor', area: 'QM', txn: 'QS23', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Display Master Inspection Characteristics', label: 'Open Display Master Inspection Characteristics' }),
      S({ op: 'manual', label: 'Display PACK characteristic in DL00', instruction: `Enter Plant "${d.plant}" and Master Insp. Char. "${d.characteristic}", then press Enter to inspect Status (Status 2 / Released) and verify Global Bike characteristics (${d.expectedChars.join(', ')}).`, values: { Plant: d.plant, Characteristic: d.characteristic, Expected: 'Status 2 / Released' } }),
      S({ op: 'shot', name: 'qm-lab1-taskA-pack', caption: `Task A: Master Inspection Characteristic ${d.characteristic} in Plant ${d.plant}` })
    ]
  },
  {
    id: 2, title: 'Task B: Display Catalog & Selected Sets', role: 'Warehouse Supervisor', area: 'QM', txn: 'QS42', shot: true,
    steps: (d) => [
      S({ op: 'fioriApp', app: 'Display Catalog', label: 'Open Display Catalog' }),
      S({ op: 'manual', label: 'Display Catalog 1 selected sets', instruction: `Enter Catalog "${d.catalog}", Plant "${d.plant}", Selected Set "${d.selectedSet}", and execute to inspect PACK and COLOR selected sets and codes (${d.expectedCodes.join(', ')}).`, values: { Catalog: d.catalog, Plant: d.plant, 'Selected Set': d.selectedSet } }),
      S({ op: 'shot', name: 'qm-lab1-taskB-catalog', caption: `Task B: Catalog ${d.catalog} Selected Sets and Evaluation Codes in Plant ${d.plant}` })
    ]
  }
]

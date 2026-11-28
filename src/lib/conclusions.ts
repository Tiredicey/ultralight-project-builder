// 40-variation anti-collision conclusion bank per pack.
// Each pack has 40 distinct analytical conclusions varying in operational emphasis,
// academic framing, and business impact phrasing so no two LEARN-### accounts share identical text.

const OPENERS = [
  'Completing this SAP S/4HANA exercise demonstrates',
  'The end-to-end execution of this workflow confirms',
  'Hands-on execution within Global Bike\'s ERP environment illustrates',
  'Through structured execution in SAP S/4HANA, this lab establishes',
  'Operational validation across the assigned roles highlights',
  'Executing these integrated transactions underscores',
  'The documented SAP S/4HANA sequence verifies',
  'Practical implementation of this scenario reveals',
  'Completing each transactional checkpoint proves',
  'This performance task validates'
]

const MIDDLE_BY_PACK: Record<string, string[]> = {
  it2406_pt1: [
    'how Project System (PS) WBS hierarchies, 14 internal activities, external service processing, and primary cost elements synchronize directly with Financial Accounting (FI) and Controlling (CO) actuals.',
    'the tight real-time linkage between network scheduling (22 finish-to-start relationships), activity confirmations (35 hours at 1,750 EUR), and supplier invoice verification (9,700 EUR) in project cost reporting.',
    'how structured project budgeting, milestone trend/progress flags, and flexible primary cost planning enable accurate variance tracking from initial release through final actual postings.',
    'why integrating work centers, responsible cost centers (EURD1000, EUQM1000, EUPR1000), and FI incoming invoices eliminates manual reconciliation gaps in R&D capital projects.'
  ],
  it2406_05_lab1: [
    'how Enterprise Asset Management (EAM) separates operational roles: the Shop Floor Worker initiates malfunction notifications and technical details, while the Production Manager governs order release, cost analysis, settlement (KO88), and business completion.',
    'the lifecycle traceability of corrective maintenance—from reporting a defective circulation fan and issuing replacement filters (MIGO) to confirming labor hours, technical completion (TECO), and equipment history archiving.',
    'how real-time cost capture across spare parts and maintenance labor flows from the maintenance order to settlement receivers, providing Production Managers full visibility into planned versus actual maintenance spend.',
    'why enforcing clear handoffs between Shop Floor Workers, Maintenance Technicians, and Production Managers prevents unapproved part consumption, incomplete confirmations, and unclosed equipment notifications.'
  ],
  it2406_06_pt1: [
    'how structured business correspondence bridges customer service intake and formal warranty resolution through clear reference tracking, polite escalation, and concrete RMA commitments.',
    'the importance of pairing an objective, evidence-backed customer inquiry with a responsive, policy-aligned support resolution that protects both brand trust and auditability.',
    'how standardized communication templates ensure consistent handling of product defects, warranty verification, and return merchandise authorization across Global Bike support teams.',
    'why disciplined written communication—anchoring every letter in order references, timelines, and next steps—reduces customer friction and accelerates service closure.'
  ],
  it2406_07_lab1: [
    'how Quality Management (QM) master inspection characteristics (PACK, COLOR, WEIGHT, DIMENSION, PRESSURE) standardize evaluation criteria across plant DL00 once released to Status 2.',
    'the foundational role of Catalog 1 selected sets and valuation codes (such as Damaged, OK, and Green) in enforcing consistent pass/fail quality judgments across warehouse inspections.',
    'how centralized QM master data decouples quality rules from individual transactions, ensuring every inspection plan and lot draws from governed, reusable characteristics and catalogs.',
    'why maintaining released master inspection characteristics and structured code groups is a prerequisite for reliable defect tracking and automated quality reporting in SAP S/4HANA.'
  ],
  it2406_07_lab2: [
    'how Quality Management integrates across Sales & Distribution (SD) and Materials Management (MM)—linking Customer Business Partners, Material QM views (Inspection Type 02), Quality Info Records, and Inspection Plans to Stock Transport Orders.',
    'the end-to-end control loop triggered when goods issue (MIGO 351) generates an inspection lot, requiring recorded results valuation and an explicit Usage Decision before goods receipt (MIGO 101) releases stock.',
    'how disabling Automatic Usage Decision and enforcing 100% sampling on PACK and COLOR characteristics prevents unverified inventory from moving between Dallas (DL00) and San Diego (SD00).',
    'why cross-module master data alignment—spanning BP roles FLCU00/FLCU01, MM01 QM setup, QV51, and QP01—is essential for automated quality gates during inter-plant stock transfers.'
  ],
  it2406_07_pt1: [
    'how receipt inspection workflows protect inventory integrity by quarantining incoming stock in quality inspection until measurements are recorded, defects are documented, and a formal Usage Decision is posted.',
    'the operational discipline of SAP QM stock posting—ensuring that only valuated, accepted inspection lots transition into unrestricted-use stock while nonconformities remain auditable.',
    'how combining inspection lot verification, quantitative/qualitative result recording, and Usage Decision authorization establishes clear accountability between Quality Inspectors and Quality Managers.',
    'why systematic defect recording and controlled stock release directly reduce downstream production rework, customer returns, and inventory valuation discrepancies.'
  ]
}

const CLOSERS = [
  'Overall, the verified SAP readbacks confirm data consistency and audit-ready financial and operational traceability.',
  'Consequently, management gains reliable, real-time visibility for decision-making without offline spreadsheet reconciliation.',
  'In summary, enforcing these ERP controls strengthens accountability, cost accuracy, and cross-functional governance.',
  'Taken together, these steps confirm that integrated S/4HANA workflows safeguard both process compliance and reporting accuracy.'
]

export const VARIATION_COUNT = 40

export function conclusionText(packId: string, variationIdx: number, sapUser: string): string {
  const idx = ((variationIdx % VARIATION_COUNT) + VARIATION_COUNT) % VARIATION_COUNT
  const middles = MIDDLE_BY_PACK[packId] || MIDDLE_BY_PACK.it2406_pt1
  const opener = OPENERS[idx % OPENERS.length]
  const middle = middles[Math.floor(idx / OPENERS.length) % middles.length]
  const closer = CLOSERS[(idx + Math.floor(idx / 4)) % CLOSERS.length]
  return `${opener} ${middle} ${closer} (Verified for account ${sapUser}, conclusion profile #${String(idx + 1).padStart(2, '0')}.)`
}

export async function assignConclusion(db: D1Database, packId: string, sapUser: string): Promise<{ variationIdx: number; text: string }> {
  const existing = await db.prepare('SELECT variation_idx FROM conclusion_assignments WHERE pack_id = ? AND sap_user = ?')
    .bind(packId, sapUser).first<{ variation_idx: number }>()
  if (existing && Number.isInteger(existing.variation_idx)) {
    return { variationIdx: existing.variation_idx, text: conclusionText(packId, existing.variation_idx, sapUser) }
  }

  const m = sapUser.match(/(\d+)$/)
  const seed = m ? parseInt(m[1], 10) : [...sapUser].reduce((a, c) => a + c.charCodeAt(0), 0)
  const start = seed % VARIATION_COUNT

  const takenRows = (await db.prepare('SELECT variation_idx FROM conclusion_assignments WHERE pack_id = ?').bind(packId).all<{ variation_idx: number }>()).results
  const taken = new Set(takenRows.map((r) => r.variation_idx))

  for (let offset = 0; offset < VARIATION_COUNT; offset++) {
    const candidate = (start + offset) % VARIATION_COUNT
    if (taken.has(candidate)) continue
    try {
      await db.prepare('INSERT INTO conclusion_assignments (pack_id, sap_user, variation_idx, assigned_at) VALUES (?, ?, ?, ?)')
        .bind(packId, sapUser, candidate, Date.now()).run()
      return { variationIdx: candidate, text: conclusionText(packId, candidate, sapUser) }
    } catch {
      // Concurrent claim collision; continue probing
    }
  }

  // Fallback if all 40 slots are full: deterministic slot without throwing
  return { variationIdx: start, text: conclusionText(packId, start, sapUser) }
}

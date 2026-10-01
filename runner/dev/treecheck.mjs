// Offline check of the tree reader against both SAP WebGUI tree renderings seen live:
// A = mrss table rows (LEARN-626/653), B = tree#Cnnn#row#col buttons with a TECH_KEY column (LEARN-636, job 23).
import { chromium } from 'playwright'
import { treeRows, selectTreeObject, pickTreeRow } from '../src/sap.mjs'

const rowsB = [
  ['Project Definition', 'Development of Ultralight Bike 636 (I)', 'P/2636', 0],
  ['WBS Element', 'Development of Ultralight Bike', 'P/2636', 1],
  ['Network header', 'Development of Ultralight Bike', '4000200', 2],
  ['Network Activity', 'General concept', '0010', 3],
  ['WBS Element', 'Engineering', 'P/2636-1', 2],
  ['Network Activity', 'Engineering of carbon frame', '0020', 3],
  ['WBS Element', 'Prototype', 'P/2636-2', 2]
]
const pageB = `<html><head><title>Project Builder: Project P/2636</title></head><body style="margin:0">
<div style="position:absolute;top:150px;left:400px"><input value="P/2636" id="h1"><input value="Development" id="h2"></div>
<div id="tree" style="position:absolute;top:220px;left:40px;width:350px">${rowsB.map(([k, t, id, lv], i) => `<div style="height:25px;position:relative"><span role="button" id="tree#C109#${i + 1}#ni" title="${k}" style="position:absolute;left:${lv * 16}px;width:20px;height:22px;display:inline-block"></span><span role="button" id="tree#C109#${i + 1}#1#          1#i" style="position:absolute;left:${lv * 16 + 24}px;height:22px;display:inline-block" onclick="document.getElementById('h1').value='${id}'">${t}</span><span role="button" id="tree#C109#${i + 1}#2#TECH_KEY#i" style="position:absolute;left:390px;height:22px;display:inline-block">${id}</span></div>`).join('')}</div>
<div style="position:absolute;top:900px;left:40px"><span role="button" id="tree#C115#1#ni" style="display:inline-block;width:20px;height:22px"></span><span role="button" id="tree#C115#1#1#HIER_COL#i">Individual Objects</span></div>
</body></html>`

const pageA = `<html><head><title>Project Builder: Project P/2653</title></head><body>
<table><tr id="C1-mrss-cont-left-Row-0" iidx="0"><td lv="0"><span class="lsTextView">Development of Ultralight Bike 653 (I)</span></td></tr>
<tr id="C1-mrss-cont-left-Row-1" iidx="1"><td lv="1"><span class="lsTextView">Development of Ultralight Bike</span></td></tr></table>
<table><tr id="C1-mrss-cont-none-Row-0"><td>P/2653</td></tr><tr id="C1-mrss-cont-none-Row-1"><td>P/2653</td></tr></table></body></html>`

const b = await chromium.launch()
const pg = await b.newPage({ viewport: { width: 1920, height: 1200 } })
let fail = 0
const ok = (c, m, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}${d ? `  (${d})` : ''}`); if (!c) fail++ }

await pg.setContent(pageB)
const rb = await treeRows(pg)
ok(rb.length === 7, 'B: 7 project tree rows, templates tree ignored', rb.length)
ok(rb[0].ident === 'P/2636' && rb[0].lv === '0', 'B: project definition level 0', JSON.stringify(rb[0]))
ok(rb[1].ident === 'P/2636' && rb[1].lv === '1', 'B: top WBS level 1', JSON.stringify(rb[1]))
ok(rb[3].ident === '4000200 0010', 'B: activity ident carries network number', rb[3].ident)
ok(pickTreeRow(rb, { ident: 'P/2636', level: 1 })?.kind === 'WBS Element', 'B: pick top WBS for Activity Overview')
ok(pickTreeRow(rb, { ident: 'P/2636', level: 0 })?.kind === 'Project Definition', 'B: pick project definition')
ok(pickTreeRow(rb, { act: '0020' })?.text === 'Engineering of carbon frame', 'B: pick activity 0020')
const sel = await selectTreeObject(pg, { ident: 'P/2636', level: 1 })
ok(sel.ok && sel.network === '4000200', 'B: selectTreeObject clicks row, header verified, network read', JSON.stringify({ ok: sel.ok, r: sel.reason, n: sel.network }))
const sel2 = await selectTreeObject(pg, { act: '0020' })
ok(sel2.ok, 'B: selectTreeObject on activity 0020', sel2.reason || sel2.header?.join('/'))

await pg.setContent(pageA)
const ra = await treeRows(pg)
ok(ra.length === 2 && ra[1].ident === 'P/2653' && ra[1].lv === '1' && !ra[1].alt, 'A: mrss tree still read the old way', JSON.stringify(ra))
await b.close()
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)

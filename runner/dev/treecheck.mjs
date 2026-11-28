// Offline check of the tree reader against both SAP WebGUI tree renderings seen live:
// A = mrss table rows (LEARN-626/653), B = tree#Cnnn#row#col buttons with a TECH_KEY column (LEARN-636, job 23).
import { chromium } from 'playwright'
import { treeRows, selectTreeObject, pickTreeRow } from '../src/sap.mjs'
import { overviewNode } from '../src/recipes.mjs'

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

const rowsC = rowsB.filter(([k]) => !/Network/.test(k))
await pg.setContent(pageB.replace(/<div id="tree"[\s\S]*?<\/div>\n<div style="position:absolute;top:900px/, `<div id="tree" style="position:absolute;top:220px;left:40px;width:350px">${rowsC.map(([k, t, id, lv], i) => `<div style="height:25px;position:relative"><span role="button" id="tree#C109#${i + 1}#ni" title="${k}" style="position:absolute;left:${lv * 16}px;width:20px;height:22px;display:inline-block"></span><span role="button" id="tree#C109#${i + 1}#1#          1#i" style="position:absolute;left:${lv * 16 + 24}px;height:22px;display:inline-block" onclick="document.getElementById('h1').value='${id}'">${t}</span><span role="button" id="tree#C109#${i + 1}#2#TECH_KEY#i" style="position:absolute;left:390px;height:22px;display:inline-block">${id}</span></div>`).join('')}</div>\n<div style="position:absolute;top:900px`))
const ctxC = { page: pg, vars: { project: 'P/2636' } }
const nodeC = overviewNode(ctxC, {})
ok(nodeC.ident === 'P/2636' && nodeC.level === 1, 'C (job 27 frame): no network in tree, step without project arg falls back to opened project', JSON.stringify(nodeC))
const selC = await selectTreeObject(pg, nodeC)
ok(selC.ok && selC.hit.kind === 'WBS Element', 'C: top WBS selected for Activity Overview', selC.reason || selC.hit?.kind)
ok(overviewNode({ vars: { network: '4000200', project: 'P/2636' } }, {}).ident === '4000200', 'C: network preferred when known')

const many = Array.from({ length: 30 }, (_, i) => ['Network Activity', `Act ${i}`, String(1000 + i * 10).padStart(4, '0'), 3])
const vrows = [['Project Definition', 'Dev', 'P/2636', 0], ['WBS Element', 'Dev', 'P/2636', 1], ['Network header', 'Net', '4000123', 2], ...many]
const vpage = `<html><head><title>Project Builder: Project P/2636</title></head><body style="margin:0"><div style="position:absolute;top:150px;left:400px"><input value="P/2636" id="h1"><input value="x" id="h2"></div>
<div id="tree" style="position:absolute;top:220px;left:40px;width:350px;height:300px;overflow:hidden"></div><script>
const R = ${JSON.stringify(vrows)}
let off = 0
const tree = document.getElementById('tree')
const draw = () => { tree.innerHTML = R.slice(off, off + 10).map(([k, t, id, lv], j) => { const i = off + j + 1; return '<div style="height:25px;position:relative"><span role="button" id="tree#C109#' + i + '#ni" title="' + k + '" style="position:absolute;left:' + lv * 16 + 'px;width:20px;height:22px;display:inline-block"></span><span role="button" data-id="' + id + '" id="tree#C109#' + i + '#1#          1#i" style="position:absolute;left:' + (lv * 16 + 24) + 'px;height:22px;display:inline-block">' + t + '</span><span role="button" id="tree#C109#' + i + '#2#TECH_KEY#i" style="position:absolute;left:390px;height:22px;display:inline-block">' + id + '</span></div>' }).join('') }
tree.addEventListener('click', (e) => { const t = e.target.closest('[data-id]'); if (t) document.getElementById('h1').value = t.dataset.id })
tree.addEventListener('wheel', (e) => { off = Math.max(0, Math.min(R.length - 10, off + (e.deltaY > 0 ? 4 : -4))); draw() })
draw()
</script></body></html>`
await pg.setContent(vpage)
ok((await treeRows(pg)).length === 10, 'D: virtual tree renders 10 of 33 rows', (await treeRows(pg)).length)
const selD = await selectTreeObject(pg, { act: '1280' })
ok(selD.ok && selD.header.includes('1280'), 'D: row below the visible window found by scrolling (LEARN-636 4.16 "Tree object 0130 not found")', selD.reason || selD.header?.join('/'))
const selE = await selectTreeObject(pg, { ident: 'P/2636', level: 1 })
ok(selE.ok, 'D: scrolls back up to the top WBS', selE.reason)
const selF = await selectTreeObject(pg, { act: '9999' })
ok(!selF.ok && /not found \(33 tree rows read/.test(selF.reason), 'D: missing row reports every row seen while scrolling', selF.reason)
const hidden = `<html><body><div><span role="button" id="tree#C109#1#ni" title="WBS Element" style="display:inline-block;width:20px;height:22px"></span><span id="tree#C109#1#1-arialabel" style="position:absolute;width:0;height:0;overflow:hidden">Level 1 Expanded</span><span role="button" id="tree#C109#1#1#          1#i" style="display:inline-block;height:22px">Development of Ultralight Bike</span><span role="button" id="tree#C109#1#2#TECH_KEY#i" style="display:inline-block;height:22px">P/2636</span></div></body></html>`
await pg.setContent(hidden)
const rh = await treeRows(pg)
ok(rh[0]?.text === 'Development of Ultralight Bike' && rh[0]?.sel.endsWith('#i'), 'E: hidden aria-label span ignored (LEARN-636 run 28 "header shows nothing")', JSON.stringify(rh[0]))

await pg.setContent(pageA)
const ra = await treeRows(pg)
ok(ra.length === 2 && ra[1].ident === 'P/2653' && ra[1].lv === '1' && !ra[1].alt, 'A: mrss tree still read the old way', JSON.stringify(ra))
await b.close()
console.log(fail ? `${fail} FAILED` : 'ALL PASS')
process.exit(fail ? 1 : 0)

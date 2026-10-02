const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function taskProgress(steps, status, curIdx, live) {
  const by = new Map()
  steps.forEach((s, i) => {
    const t = by.get(s.task) || { task: s.task, total: 0, ok: 0, err: 0, warn: 0, first: s.key, cur: false }
    t.total++
    const st = status[s.key]
    if (st === 'ok') t.ok++
    else if (st === 'error') t.err++
    else if (st === 'warn') t.warn++
    if (live && i === curIdx) t.cur = true
    by.set(s.task, t)
  })
  return [...by.values()]
}

export function ribbon(list, titles = {}) {
  if (!list.length) return ''
  const state = (t) => (t.err ? 'err' : t.cur ? 'cur' : t.ok + t.warn >= t.total ? (t.warn ? 'warn' : 'ok') : t.ok + t.warn ? 'part' : 'todo')
  const word = { err: 'failed', cur: 'running', ok: 'verified', warn: 'check', part: 'in part', todo: 'not started' }
  return `<ol class="ribbon" aria-label="Tasks in this run">${list.map((t) => {
    const s = state(t), done = t.ok + t.warn
    const label = `Task ${t.task}${titles[t.task] ? `, ${titles[t.task]}` : ''}: ${word[s]}, ${done} of ${t.total} steps`
    return `<li class="rb ${s}" style="--p:${Math.round((done / t.total) * 100)}%"><button type="button" data-rb="${esc(t.first)}" title="${esc(label)}" aria-label="${esc(label)}"><b>${t.task}</b><i aria-hidden="true"></i></button></li>`
  }).join('')}</ol>`
}

export function runBar(j) {
  const total = Number(j.step_total) || 0
  if (!total) return '<span class="small muted">no steps</span>'
  const r = j.result || {}
  const ok = Number(r.ok) || 0, sk = Number(r.skipped) || 0, man = Number(r.manual) || 0, fail = Number(r.failed) || 0
  const parts = j.result ? [['ok', ok], ['sk', sk], ['man', man], ['fail', fail]] : [['ok', Math.min(Number(j.step_idx) || 0, total)]]
  const used = parts.reduce((a, [, n]) => a + n, 0)
  const pct = (n) => `${Math.max(0, Math.min(100, (n / Math.max(total, used)) * 100)).toFixed(2)}%`
  const text = j.result ? `${ok} verified, ${sk} skipped, ${man} by operator, ${fail} failed of ${total}` : `${Math.min(Number(j.step_idx) || 0, total)} of ${total} steps`
  return `<span class="runbar" role="img" aria-label="${esc(text)}" title="${esc(text)}">${parts.filter(([, n]) => n > 0).map(([k, n]) => `<i class="${k}" style="width:${pct(n)}"></i>`).join('')}</span>`
}

export const duration = (j) => {
  if (!j.started_at) return ''
  const ms = (j.finished_at || Date.now()) - j.started_at
  if (ms < 0) return ''
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`
}

export function gantt(acts, c) {
  const rows = [...acts].sort((a, b) => c.es[a.act] - c.es[b.act] || a.act.localeCompare(b.act))
  const L = 210, R = 16, T = 30, RH = 26, DW = 18
  const W = L + c.end * DW + R, H = T + rows.length * RH + 10
  const x = (d) => L + d * DW
  const ticks = []
  for (let d = 0; d <= c.end; d += 5) ticks.push(d)
  if (ticks[ticks.length - 1] !== c.end) ticks.push(c.end)
  const grid = ticks.map((d) => `<line class="g-tick" x1="${x(d)}" x2="${x(d)}" y1="${T - 6}" y2="${H - 6}"/><text class="g-ax" x="${x(d)}" y="${T - 12}" text-anchor="middle">${d}</text>`).join('')
  const body = rows.map((a, i) => {
    const y = T + i * RH, dur = Number(a.dur) || 0, es = c.es[a.act], fl = c.ls[a.act] - es
    const crit = fl === 0 && dur > 0
    const tip = `${a.act} ${a.desc}: day ${es} to ${c.ef[a.act]}, float ${fl}`
    const bar = dur > 0
      ? `<rect class="g-bar${crit ? ' crit' : ''}" x="${x(es)}" y="${y + 6}" width="${Math.max(2, dur * DW - 2)}" height="${RH - 12}" rx="4"/>`
      : `<path class="g-zero" d="M${x(es)} ${y + 6}l7 7-7 7-7-7z"/>`
    const slack = fl > 0 ? `<line class="g-float" x1="${x(c.ef[a.act]) + 2}" x2="${x(c.ef[a.act] + fl)}" y1="${y + RH / 2}" y2="${y + RH / 2}"/><line class="g-float" x1="${x(c.ef[a.act] + fl)}" x2="${x(c.ef[a.act] + fl)}" y1="${y + 8}" y2="${y + RH - 8}"/>` : ''
    return `<g class="g-row" data-act="${esc(a.act)}"><title>${esc(tip)}</title><rect class="g-band" x="0" y="${y}" width="${W}" height="${RH}"/><text class="g-id" x="8" y="${y + 17}">${esc(a.act)}</text><text class="g-desc" x="48" y="${y + 17}">${esc(a.desc.length > 24 ? `${a.desc.slice(0, 23)}…` : a.desc)}</text>${slack}${bar}</g>`
  }).join('')
  return `<svg class="gantt" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Schedule: ${rows.length} activities over ${c.end} working days, critical path highlighted"><text class="g-ax" x="8" y="${T - 12}">Activity</text>${grid}${body}</svg>`
}

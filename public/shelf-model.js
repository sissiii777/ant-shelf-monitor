import { unique, isConfirmed } from './model.js';

export function shelfRows(data, shelf, sub = null, view = 'current', search = '', sortKey = '', direction = 'asc') {
  const relations = data.relations.filter(row => row.shelf === shelf && (!sub || row.sub === sub));
  const confirmed = relations.filter(isConfirmed);
  const codes = unique(confirmed.map(row => row.code));
  const changes = status => unique(relations.filter(row => row.status === status).map(row => row.code)).length;
  const selected = relations.filter(row => view === 'current' ? isConfirmed(row) : view === 'exited' ? row.status === '出池' : row.status === '待核实');
  const rows = unique(selected.map(row => row.code)).map(code => {
    const sources = selected.filter(row => row.code === code);
    const first = sources[0];
    const keys = unique(sources.flatMap(row => Object.keys(row.fields || {})));
    const fields = Object.fromEntries(keys.map(key => {
      const observations = sources.map(row => row.fields?.[key]).filter(Boolean);
      const valid = observations.filter(cell => cell.status === 'ok');
      const distinct = unique(valid.map(cell => JSON.stringify(cell.value)));
      return [key, distinct.length > 1 ? { status: 'conflict', value: null } : valid[0] || observations[0]];
    }));
    return { code, name: first.name, company: first.company, subs: unique(sources.map(row => row.sub).filter(Boolean)),
      status: unique(sources.map(row => row.status)).join('、'), sources, fields };
  }).filter(row => !search || [row.name, row.company, row.code].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));
  if (sortKey) rows.sort((first, second) => {
    const get = row => ['code', 'name', 'company'].includes(sortKey) ? row[sortKey] : row.fields[sortKey]?.status === 'ok' ? row.fields[sortKey].value : null;
    const left = get(first);
    const right = get(second);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'zh-CN');
    return direction === 'asc' ? compared : -compared;
  });
  return { rows, relations, confirmed, metrics: { count: codes.length,
    companies: unique(confirmed.map(row => row.company).filter(Boolean)).length,
    huaan: unique(confirmed.filter(row => row.company === '华安').map(row => row.code)).length,
    incoming: changes('入池'), outgoing: changes('出池'), hasChanges: relations.some(row => ['入池', '出池'].includes(row.status)) } };
}

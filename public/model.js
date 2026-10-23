export const SHELVES = [
  { name: '稳健理财', children: ['安理财', '稳理财', '盈理财'], short: '稳健理财' },
  { name: '金选收益+', children: ['年年', '季季', '月月'], short: '金选收益+' },
  { name: '金选理财+', children: [], short: '金选理财+' },
  { name: '金选固收+', children: ['极低波', '低波', '中波', '高波'], short: '金选固收+' },
  { name: '风格化固收+', children: ['科技', '红利', '量化', '资源'], short: '风格固收+' },
];
export const ATTRIBUTES = ['原表纯债分组', '极低波', '低波', '中波', '高波', '未分类'];
export const unique = values => [...new Set(values)];
export const isConfirmed = relation => ['留池', '入池', '名单收录'].includes(relation.status) && Boolean(relation.shelf);

export function summarize(data, scope = 'snapshot', metric = 'products') {
  const relations = data.relations.filter(relation => scope === 'snapshot' || (scope === 'primary' ? ['求赚安稳盈', '求稳货架'].includes(relation.source.sheet) : relation.source.sheet === '风格化固收+'));
  const confirmed = relations.filter(isConfirmed).map(relation => {
    const sameSeat = relations.filter(other => isConfirmed(other) && other.code === relation.code && other.shelf === relation.shelf);
    const classifications = unique(sameSeat.map(other => other.sub));
    const multipleConfirmed = sameSeat.every(other => other.multipleSubclassesConfirmed);
    return classifications.length > 1 && !multipleConfirmed ? { ...relation, sub: null, issue: relation.issue || '同一产品同一货架二级分类冲突' } : relation;
  });
  const productIds = unique(confirmed.map(relation => relation.code));
  const products = data.products.filter(product => productIds.includes(product.code));
  const seats = unique(confirmed.map(relation => `${relation.code}|${relation.shelf}`));
  const changes = [];
  for (const relation of relations.filter(item => ['入池', '出池'].includes(item.status))) {
    if (!changes.some(item => item.code === relation.code && item.shelf === relation.shelf && item.status === relation.status)) changes.push(relation);
  }
  const companies = unique(products.map(product => product.company).filter(Boolean)).map(name => {
    const owned = products.filter(product => product.company === name);
    const ownedCodes = owned.map(product => product.code);
    const covered = confirmed.filter(relation => ownedCodes.includes(relation.code));
    return { name, products: owned.length, seats: unique(covered.map(relation => `${relation.code}|${relation.shelf}`)).length,
      shelves: unique(covered.map(relation => relation.shelf)).length, owned, covered };
  }).sort((first, second) => second[metric] - first[metric] || first.name.localeCompare(second.name, 'zh-CN'));
  companies.forEach((company, index) => { company.rank = companies.findIndex(other => other[metric] === company[metric]) + 1; });
  const displayed = companies.slice(0, 10);
  const huaan = companies.find(company => company.name === '华安');
  if (huaan && !displayed.includes(huaan)) displayed.push(huaan);
  const cross = products.filter(product => unique(confirmed.filter(relation => relation.code === product.code).map(relation => relation.shelf)).length >= 2);
  const shelves = SHELVES.map(shelf => {
    const rows = confirmed.filter(relation => relation.shelf === shelf.name);
    const codes = unique(rows.map(relation => relation.code));
    const childGroups = new Map();
    for (const code of codes) {
      const subs = unique(rows.filter(relation => relation.code === code).map(relation => relation.sub));
      childGroups.set(code, subs.filter(Boolean));
    }
    return { ...shelf, unknown: shelf.name === '金选固收+' && !data.meta?.goldFixedIncomeConfirmed, products: codes.length,
      companies: unique(rows.map(relation => relation.company).filter(Boolean)).length, rows,
      children: shelf.children.map(name => ({ name, count: [...childGroups.values()].filter(subs => subs.includes(name)).length })),
      unclassified: [...childGroups.values()].filter(subs => subs.length === 0).length };
  });
  return { relations, confirmed, products, seats, companies, displayed, cross, shelves, changes };
}

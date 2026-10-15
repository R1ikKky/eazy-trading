import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrades, filterTrades, csvTrades } from '../dist/analytics.mjs';

const timestamp = iso => Date.parse(iso) / 1000;
const near = (actual, expected, label = '') => assert.ok(
  Math.abs(actual - expected) < 1e-9,
  `${label}: expected ${expected}, received ${actual}`,
);
const trade = (overrides = {}) => ({
  id: 'trade-1', symbol: 'NQ', side: 1, qty: 1,
  time: timestamp('2024-01-02T15:00:00Z'),
  exitTime: timestamp('2024-01-02T15:10:00Z'),
  entry: 16800, exit: 16810, pnl: 200, r: 2,
  strategyId: 'displacement', strategyName: 'Displacement',
  tags: ['A+', 'NY open'], sessionId: 'session-1',
  ...overrides,
});
const amounts = [200, -100, 0, 300, -150, -50, 100, 0];
const multiples = [2, -1, null, 3, -1.5, -0.5, 1, undefined];
const sample = amounts.map((pnl, index) => {
  const exitTime = timestamp(index < 4
    ? `2024-01-02T${String(15 + index).padStart(2, '0')}:00:00Z`
    : `2024-01-03T${String(15 + index - 4).padStart(2, '0')}:00:00Z`);
  return trade({
    id: `trade-${index + 1}`, pnl, r: multiples[index], exitTime,
    time: exitTime - (index + 1) * 600,
    symbol: index < 4 ? 'NQ' : 'ES',
    strategyId: index < 4 ? 'displacement' : 'smt',
    strategyName: index < 4 ? 'Displacement' : 'SMT',
    sessionId: index < 4 ? 'session-1' : 'session-2',
    tags: index % 2 === 0 ? ['A+', 'NY open'] : ['B', 'London'],
  });
});

test('closed-trade metrics and drawdown include breakevens without counting them as wins', () => {
  const result = analyzeTrades([...sample].reverse(), { capital: 50000 });
  assert.equal(result.count, 8);
  assert.equal(result.net, 300);
  assert.equal(result.wins, 3);
  near(result.winRate, 37.5, 'win rate');
  near(result.pf, 2, 'profit factor');
  near(result.expectancy, 37.5, 'expectancy');
  near(result.avgR, 0.5, 'mean R excludes missing R');
  assert.equal(result.maxClosedDrawdown, 200);
  assert.equal(result.maxWinStreak, 1);
  assert.equal(result.maxLossStreak, 2);
  near(result.avgHoldMinutes, 45, 'average holding time');
  assert.equal(result.equity.length, 9);
  assert.equal(result.equity[0].balance, 50000);
  assert.equal(result.equity[0].count, 0);
  assert.deepEqual(result.equity.slice(1).map(point => point.balance),
    [50200, 50100, 50100, 50400, 50250, 50200, 50300, 50300]);
  assert.deepEqual(result.equity.slice(1).map(point => point.drawdown),
    [0, 100, 100, 0, 150, 200, 100, 100]);
  assert.deepEqual(result.equity.slice(1).map(point => point.time), sample.map(row => row.exitTime));
});

test('a breakeven explicitly resets both win and loss streaks', () => {
  const pnls = [10, 20, 0, 30, 40, -10, -20, 0, -30, -40];
  const rows = pnls.map((pnl, index) => trade({
    pnl, exitTime: sample[0].exitTime + index * 60,
  }));
  const result = analyzeTrades(rows);
  assert.equal(result.maxWinStreak, 2);
  assert.equal(result.maxLossStreak, 2);
});

test('empty, breakeven-only, all-winning and all-losing samples have honest undefined ratios', () => {
  const empty = analyzeTrades([], { capital: 50000 });
  assert.equal(empty.count, 0);
  assert.equal(empty.net, 0);
  assert.equal(empty.pf, null);
  assert.equal(empty.avgR, null);
  assert.equal(empty.maxClosedDrawdown, 0);
  assert.deepEqual(empty.equity, []);
  assert.equal(empty.capital, 50000);
  assert.equal(empty.endingBalance, 50000);
  const even = analyzeTrades([trade({ pnl: 0, r: null })]);
  assert.equal(even.pf, null);
  assert.equal(even.winRate, 0);
  assert.equal(even.avgR, null);
  const winning = analyzeTrades([trade({ pnl: 120 }), trade({ pnl: 80 })]);
  assert.equal(winning.pf, Infinity);
  assert.equal(winning.winRate, 100);
  const losing = analyzeTrades([trade({ pnl: -120 }), trade({ pnl: -80 })]);
  assert.equal(losing.pf, 0);
  assert.equal(losing.winRate, 0);
  assert.equal(losing.maxClosedDrawdown, 200);
});

test('invalid closed rows are excluded and missing or invalid R cannot silently become zero', () => {
  const valid = [trade({ id: 'valid-1', r: 2 }), trade({ id: 'valid-2', r: '' })];
  const invalid = [
    null, {}, trade({ pnl: NaN }), trade({ pnl: Infinity }), trade({ pnl: '' }),
    trade({ exitTime: NaN }), trade({ exitTime: 'not-a-date' }), trade({ exitTime: null }),
  ];
  const result = analyzeTrades([...valid, ...invalid]);
  assert.equal(result.count, 2);
  assert.equal(result.net, 400);
  assert.equal(result.avgR, 2);
  assert.deepEqual(filterTrades([...valid, ...invalid], {}), valid);
  const missingR = analyzeTrades([
    trade({ r: null }), trade({ r: undefined }), trade({ r: '' }), trade({ r: '  ' }), trade({ r: NaN }),
  ]);
  assert.equal(missingR.avgR, null);
});

test('daily and strategy groups reconcile to the full sample', () => {
  const result = analyzeTrades(sample);
  assert.deepEqual(result.days.map(({ date, count, net }) => ({ date, count, net })), [
    { date: '2024-01-02', count: 4, net: 400 },
    { date: '2024-01-03', count: 4, net: -100 },
  ]);
  assert.deepEqual(result.strategies.map(({ id, name, count, net }) => ({ id, name, count, net }))
    .sort((a, b) => a.id.localeCompare(b.id)), [
    { id: 'displacement', name: 'Displacement', count: 4, net: 400 },
    { id: 'smt', name: 'SMT', count: 4, net: -100 },
  ]);
  assert.equal(result.days.reduce((sum, day) => sum + day.net, 0), result.net);
  assert.equal(result.strategies.reduce((sum, strategy) => sum + strategy.count, 0), result.count);
});

test('New York date filtering includes both ends and observes winter and summer UTC boundaries', () => {
  const winter = [
    trade({ id: 'previous', exitTime: timestamp('2024-01-02T04:59:59Z') }),
    trade({ id: 'start', exitTime: timestamp('2024-01-02T05:00:00Z') }),
    trade({ id: 'end', exitTime: timestamp('2024-01-03T04:59:59Z') }),
    trade({ id: 'next', exitTime: timestamp('2024-01-03T05:00:00Z') }),
  ];
  assert.deepEqual(filterTrades(winter, { from: '2024-01-02', to: '2024-01-02' })
    .map(row => row.id), ['start', 'end']);
  const summer = [
    trade({ id: 'previous', exitTime: timestamp('2024-07-02T03:59:59Z') }),
    trade({ id: 'start', exitTime: timestamp('2024-07-02T04:00:00Z') }),
    trade({ id: 'end', exitTime: timestamp('2024-07-03T03:59:59Z') }),
    trade({ id: 'next', exitTime: timestamp('2024-07-03T04:00:00Z') }),
  ];
  assert.deepEqual(filterTrades(summer, { from: '2024-07-02', to: '2024-07-02' })
    .map(row => row.id), ['start', 'end']);
  assert.deepEqual(analyzeTrades(winter).days.map(day => day.date),
    ['2024-01-01', '2024-01-02', '2024-01-03']);
});

test('combined filters select the matching original rows without reordering or mutation', () => {
  const rows = [sample[4], sample[0], sample[2], sample[1], sample[6]];
  const before = JSON.stringify(rows);
  assert.deepEqual(filterTrades(rows, {
    symbol: 'NQ', strategyId: 'displacement', tag: 'A+',
    sessionId: 'session-1', search: 'displace',
    from: '2024-01-02', to: '2024-01-02',
  }), [sample[0], sample[2]]);
  assert.deepEqual(filterTrades(rows, { symbol: 'ES' }), [sample[4], sample[6]]);
  assert.deepEqual(filterTrades(rows, { search: 'nY oPeN' }), [sample[4], sample[0], sample[2], sample[6]]);
  assert.deepEqual(filterTrades(rows, { sessionId: 'session-2', strategyId: 'smt' }), [sample[4], sample[6]]);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(filterTrades(rows, { from: '2024-01-03', to: '2024-01-02' }), []);
});

// Small independent RFC-4180 reader: keeps commas/newlines inside quoted cells.
function parseCSV(source) {
  const rows = []; let row = [], cell = '', quoted = false;
  source = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\r' || character === '\n')) {
      row.push(cell); rows.push(row); row = []; cell = '';
      if (character === '\r' && source[index + 1] === '\n') index++;
    } else cell += character;
  }
  assert.equal(quoted, false, 'CSV must close every quoted cell');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('CSV quotes text and round-trips commas, double quotes and embedded newlines', () => {
  const name = 'ICT, "A+"\nretest';
  const exported = csvTrades([trade({ strategyName: name, pnl: -100, r: -1 })]);
  assert.equal(typeof exported, 'string');
  assert.ok(exported.includes('"NQ"'), 'text symbols must be quoted');
  assert.ok(exported.includes('"ICT, ""A+""\nretest"'), 'text must escape quotes, not strip them');
  const rows = parseCSV(exported);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, rows[1].length);
  assert.ok(rows[1].includes(name));
  assert.ok(rows[1].some(value => value === '-100'), 'numeric losses stay numeric');
});

test('CSV prevents formulas from user-entered text without changing numeric PnL', () => {
  const attacks = ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1:A2)', '\t=1+1', '\r=1+1', '\n=1+1'];
  const exported = csvTrades(attacks.map((strategyName, index) => trade({
    id: `csv-${index}`, strategyName, pnl: -25, r: -0.25,
  })));
  const rows = parseCSV(exported);
  assert.equal(rows.length, attacks.length + 1);
  for (let index = 0; index < attacks.length; index++) {
    assert.ok(rows[index + 1].includes("'" + attacks[index]),
      `CSV must prefix unsafe text with apostrophe: ${JSON.stringify(attacks[index])}`);
    assert.ok(rows[index + 1].includes('-25'));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalytics } from '../dist/analytics.mjs';

// The renderer uses only its supplied container: it also works without a global document.
function container() {
  const calendar = { innerHTML: '', querySelectorAll: () => [] };
  return { innerHTML: '', calendar, querySelector: selector => selector === '.an-calendar' ? calendar : null };
}

test('empty analytics and calendar do not invent results or a dated equity curve', () => {
  const node = container();
  const analysis = renderAnalytics(node, [], { month: '2024-01' });
  assert.equal(analysis.count, 0);
  assert.match(node.innerHTML, /Пока нет закрытых сделок/);
  assert.doesNotMatch(node.innerHTML, /<svg/);
  assert.match(node.calendar.innerHTML, /Нет закрытых сделок в этом месяце/);
  assert.doesNotMatch(node.calendar.innerHTML, /data-day=|\$0\.00/);
});

test('user text is escaped and only actual trade days receive P&L cells', () => {
  const node = container();
  const trade = { pnl: 0, r: null, time: Date.parse('2024-01-02T15:00:00Z') / 1000, exitTime: Date.parse('2024-01-02T15:30:00Z') / 1000, symbol: '<img src=x onerror=alert(1)>', strategyName: 'x </td><script>alert(2)</script>' };
  renderAnalytics(node, [trade], { month: '2024-01' });
  assert.match(node.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(node.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(node.innerHTML, /<img|<script|NaN|Infinity/);
  assert.equal((node.calendar.innerHTML.match(/data-day=/g) || []).length, 1);
  assert.match(node.calendar.innerHTML, /data-day="2024-01-02"/);
  assert.match(node.calendar.innerHTML, /\$0\.00/);
});

test('large histories render without spread-argument stack overflow', () => {
  const node = container();
  const first = Date.parse('2024-01-02T15:00:00Z') / 1000;
  const trades = Array.from({ length: 140000 }, (_, index) => ({ pnl: index % 2 ? -1 : 2, r: null, time: first + index * 60, exitTime: first + index * 60 + 30, symbol: 'NQ' }));
  const analysis = renderAnalytics(node, trades, { month: '2024-01' });
  assert.equal(analysis.count, trades.length);
  assert.equal(analysis.net, 70000);
  assert.doesNotMatch(node.innerHTML, /NaN/);
  assert.ok(node.innerHTML.length < 400000, 'SVG extrema sampling keeps large curves lightweight');
});

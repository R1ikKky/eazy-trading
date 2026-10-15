const NY = 'America/New_York';
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' });
const nyTime = new Intl.DateTimeFormat('ru-RU', { timeZone: NY, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', year: 'numeric', month: 'long' });
const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
let renderId = 0;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const finite = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const money = value => Number.isFinite(value) ? usd.format(value) : '—';
const signedMoney = value => value > 0 ? '+' + money(value) : money(value);
const decimal = (value, digits = 2) => value === Infinity ? '∞' : Number.isFinite(value) ? value.toFixed(digits) : '—';
const percent = value => Number.isFinite(value) ? decimal(value, 1) + '%' : '—';
const tone = value => value > 0 ? 'an-positive' : value < 0 ? 'an-negative' : 'an-neutral';

function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() / 1000 : null;
  let seconds;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    seconds = Number(value);
    if (seconds > 1e12) seconds /= 1000;
  } else if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    seconds = Date.parse(value) / 1000;
  } else return null;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 253402300799 && Number.isFinite(new Date(seconds * 1000).getTime()) ? seconds : null;
}

function dateKey(seconds) {
  const parts = nyDate.formatToParts(new Date(seconds * 1000));
  return ['year', 'month', 'day'].map(part => parts.find(p => p.type === part).value).join('-');
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function tagList(trade) {
  return Array.isArray(trade.tags) ? trade.tags.map(text).filter(Boolean) : typeof trade.tags === 'string' ? trade.tags.split(',').map(x => x.trim()).filter(Boolean) : [];
}

function closedRows(trades) {
  if (!Array.isArray(trades)) return [];
  return trades.flatMap((trade, index) => {
    if (!trade || typeof trade !== 'object') return [];
    const pnl = finite(trade.pnl), exitTime = timestamp(trade.exitTime);
    if (pnl === null || exitTime === null) return [];
    const entryTime = timestamp(trade.time), r = finite(trade.r);
    return [{ trade, index, pnl, r, exitTime, entryTime, date: dateKey(exitTime) }];
  });
}

function summarize(rows) {
  const count = rows.length, wins = rows.filter(row => row.pnl > 0).length, losses = rows.filter(row => row.pnl < 0).length;
  const net = rows.reduce((sum, row) => sum + row.pnl, 0);
  const gain = rows.reduce((sum, row) => sum + Math.max(0, row.pnl), 0), loss = rows.reduce((sum, row) => sum - Math.min(0, row.pnl), 0);
  const rs = rows.filter(row => row.r !== null);
  return { count, net, wins, losses, breakeven: count - wins - losses, winRate: count ? wins / count * 100 : null,
    pf: loss ? gain / loss : gain ? Infinity : null, grossProfit: gain, grossLoss: loss,
    expectancy: count ? net / count : null, avgR: rs.length ? rs.reduce((sum, row) => sum + row.r, 0) / rs.length : null,
    rCount: rs.length, averageWin: wins ? gain / wins : null, averageLoss: losses ? loss / losses : null };
}

function group(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

/** Closed trade statistics. Drawdown is measured only after a closed execution. */
export function analyzeTrades(trades, { capital = 50000 } = {}) {
  const initialCapital = finite(capital) !== null && Number(capital) >= 0 ? Number(capital) : 50000;
  const rows = closedRows(trades).sort((a, b) => a.exitTime - b.exitTime || a.index - b.index);
  const summary = summarize(rows);
  let net = 0, peak = initialCapital, maxClosedDrawdown = 0, maxClosedDrawdownPct = 0;
  let winStreak = 0, lossStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  const equity = rows.length ? [{ time: rows[0].entryTime !== null && rows[0].entryTime <= rows[0].exitTime ? rows[0].entryTime : rows[0].exitTime, balance: initialCapital, net: 0, drawdown: 0, count: 0 }] : [];
  for (const row of rows) {
    net += row.pnl;
    const balance = initialCapital + net;
    peak = Math.max(peak, balance);
    const drawdown = peak - balance;
    maxClosedDrawdown = Math.max(maxClosedDrawdown, drawdown);
    if (peak > 0) maxClosedDrawdownPct = Math.max(maxClosedDrawdownPct, drawdown / peak * 100);
    if (row.pnl > 0) { winStreak++; lossStreak = 0; }
    else if (row.pnl < 0) { lossStreak++; winStreak = 0; }
    else { winStreak = 0; lossStreak = 0; }
    maxWinStreak = Math.max(maxWinStreak, winStreak);
    maxLossStreak = Math.max(maxLossStreak, lossStreak);
    equity.push({ time: row.exitTime, balance, net, drawdown, count: equity.length });
  }
  const holds = rows.filter(row => row.entryTime !== null && row.entryTime <= row.exitTime);
  const days = Array.from(group(rows, row => row.date), ([date, dayRows]) => ({ date, ...summarize(dayRows) })).sort((a, b) => a.date.localeCompare(b.date));
  const symbols = Array.from(group(rows, row => text(row.trade.symbol) || '—'), ([symbol, symbolRows]) => ({ symbol, ...summarize(symbolRows) })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const strategies = Array.from(group(rows, row => text(row.trade.strategyId) || (text(row.trade.strategyName) ? 'name:' + row.trade.strategyName : '')), ([id, strategyRows]) => ({
    id, name: text(strategyRows[0].trade.strategyName) || (id ? 'Стратегия ' + id : 'Без стратегии'), ...summarize(strategyRows)
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const weekdayRows = Array.from(group(rows, row => new Date(row.date + 'T12:00:00Z').getUTCDay()), ([weekday, dayRows]) => ({ weekday, label: weekdays[weekday], ...summarize(dayRows) })).sort((a, b) => (a.weekday + 6) % 7 - (b.weekday + 6) % 7);
  const fees = rows.reduce((sum, row) => sum + (finite(row.trade.fees) ?? 0), 0);
  return { ...summary, capital: initialCapital, endingBalance: initialCapital + summary.net, fees, maxClosedDrawdown, maxClosedDrawdownPct,
    equity, maxWinStreak, maxLossStreak, avgHoldMinutes: holds.length ? holds.reduce((sum, row) => sum + (row.exitTime - row.entryTime) / 60, 0) / holds.length : null,
    days, symbols, strategies, weekdays: weekdayRows, firstDate: days[0]?.date ?? null, lastDate: days.at(-1)?.date ?? null,
    skipped: Array.isArray(trades) ? trades.length - rows.length : 0 };
}

/** Dates select closed trades by their exit day in New York, inclusively. */
export function filterTrades(trades, { symbol, from, to, strategyId, tag, search, sessionId } = {}) {
  const needle = text(search).trim().toLocaleLowerCase('ru-RU');
  const fromDay = validDay(from) ? from : null, toDay = validDay(to) ? to : null;
  if (from && !fromDay || to && !toDay || fromDay && toDay && fromDay > toDay) return [];
  const any = value => value === undefined || value === null || value === '' || value === 'all';
  return closedRows(trades).filter(({ trade, date }) => {
    if (!any(symbol) && text(trade.symbol).toUpperCase() !== text(symbol).toUpperCase()) return false;
    if (fromDay && date < fromDay || toDay && date > toDay) return false;
    if (!any(strategyId) && text(trade.strategyId) !== text(strategyId)) return false;
    if (!any(sessionId) && text(trade.sessionId) !== text(sessionId)) return false;
    const tags = tagList(trade);
    if (!any(tag) && !tags.some(value => value.toLocaleLowerCase('ru-RU') === text(tag).toLocaleLowerCase('ru-RU'))) return false;
    if (needle) {
      const haystack = [trade.symbol, trade.strategyName, trade.strategyId, trade.sessionName, trade.sessionId, trade.reason, trade.notes, trade.note, trade.comment, trade.side === 1 ? 'long' : trade.side === -1 ? 'short' : trade.side, ...tags].map(text).join(' ').toLocaleLowerCase('ru-RU');
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }).map(row => row.trade);
}

function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let string = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(string) || /^[\t\r\n]/.test(string)) string = "'" + string;
  return '"' + string.replace(/"/g, '""') + '"';
}

/** Safe CSV export; free text cannot be interpreted as a spreadsheet formula. */
export function csvTrades(trades) {
  const columns = ['trade_id', 'session_id', 'symbol', 'side', 'quantity', 'entry_time_utc', 'exit_time_utc', 'exit_day_new_york', 'entry', 'exit', 'gross_usd', 'fees_usd', 'net_usd', 'r_multiple', 'strategy_id', 'strategy', 'tags', 'notes', 'reason', 'ambiguous', 'contract', 'data_source'];
  const rows = closedRows(trades).map(({ trade, pnl, r, exitTime, entryTime, date }) => [
    trade.id ?? trade.tradeId ?? '', trade.sessionId ?? '', trade.symbol ?? '', trade.side === 1 ? 'long' : trade.side === -1 ? 'short' : trade.side ?? '', finite(trade.qty) ?? '',
    entryTime === null ? '' : new Date(entryTime * 1000).toISOString(), new Date(exitTime * 1000).toISOString(), date,
    finite(trade.entry) ?? '', finite(trade.exit) ?? '', finite(trade.gross) ?? '', finite(trade.fees) ?? '', pnl, r ?? '', trade.strategyId ?? '', trade.strategyName ?? '', tagList(trade).join(' | '),
    trade.notes ?? trade.note ?? trade.comment ?? '', trade.reason ?? '', !!trade.ambiguous, trade.contract ?? '', trade.source ?? trade.dataSource ?? ''
  ].map(csvCell).join(','));
  return columns.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
}

function stat(label, value, detail, valueClass = '') {
  return '<article class="an-stat"><span class="an-stat-label">' + label + '</span><strong class="an-stat-value ' + valueClass + '">' + value + '</strong><span class="an-stat-detail">' + detail + '</span></article>';
}

function compactPoints(points, max = 480, field = 'balance') {
  if (points.length <= max) return points;
  const keep = new Set([0, points.length - 1]), width = Math.ceil(points.length / (max / 2));
  for (let start = 0; start < points.length; start += width) {
    let min = start, maxIndex = start;
    for (let i = start; i < Math.min(start + width, points.length); i++) {
      if (points[i][field] < points[min][field]) min = i;
      if (points[i][field] > points[maxIndex][field]) maxIndex = i;
    }
    keep.add(min); keep.add(maxIndex);
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

function graph(points, field, id, emptyText) {
  if (!points.length) return '<div class="an-chart-empty"><span>⌁</span><p>' + emptyText + '</p></div>';
  const width = 740, height = 252, left = 76, right = 18, top = 20, bottom = 37;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const values = points.map(point => field === 'drawdown' ? -point.drawdown : point.balance);
  let min = values.reduce((result, value) => Math.min(result, value), Infinity), max = values.reduce((result, value) => Math.max(result, value), -Infinity);
  if (min === max) { const padding = Math.max(1, Math.abs(min) * .02); min -= padding; max += padding; }
  else { const padding = (max - min) * .12; min -= padding; max += padding; }
  if (field === 'drawdown') max = 0;
  const firstTime = points[0].time, lastTime = points.at(-1).time;
  const x = point => left + (lastTime === firstTime ? point.count / Math.max(1, points.at(-1).count) : (point.time - firstTime) / (lastTime - firstTime)) * plotWidth;
  const y = point => top + (max - (field === 'drawdown' ? -point.drawdown : point.balance)) / (max - min) * plotHeight;
  const selected = compactPoints(points, 480, field);
  const path = selected.map((point, index) => (index ? 'L' : 'M') + x(point).toFixed(2) + ',' + y(point).toFixed(2)).join(' ');
  const baselineY = field === 'drawdown' ? top : top + plotHeight;
  const area = path + ' L' + x(selected.at(-1)).toFixed(2) + ',' + baselineY + ' L' + x(selected[0]).toFixed(2) + ',' + baselineY + ' Z';
  const grid = Array.from({ length: 4 }, (_, i) => {
    const value = max - i / 3 * (max - min), lineY = top + i / 3 * plotHeight;
    return '<line class="an-graph-grid" x1="' + left + '" x2="' + (width - right) + '" y1="' + lineY + '" y2="' + lineY + '"/><text class="an-graph-label" text-anchor="end" x="' + (left - 10) + '" y="' + (lineY + 4) + '">' + escapeHTML(money(value)) + '</text>';
  }).join('');
  const dates = [points[0], points[Math.floor(points.length / 2)], points.at(-1)].map((point, i) => '<text class="an-graph-label" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '" x="' + x(point).toFixed(2) + '" y="' + (height - 9) + '">' + escapeHTML(dateKey(point.time).slice(5).split('-').reverse().join('.')) + '</text>').join('');
  const circles = selected.slice(1).map(point => '<circle class="an-graph-hit" cx="' + x(point).toFixed(2) + '" cy="' + y(point).toFixed(2) + '" r="6"><title>' + escapeHTML(nyTime.format(new Date(point.time * 1000)) + ' NY · ' + money(field === 'drawdown' ? -point.drawdown : point.balance)) + '</title></circle>').join('');
  return '<svg class="an-graph an-graph-' + field + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="' + id + '-title"><title id="' + id + '-title">' + (field === 'drawdown' ? 'Просадка по закрытым сделкам в долларах' : 'Баланс после каждой закрытой сделки в долларах') + '</title><defs><linearGradient id="' + id + '-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".18"/><stop offset="100%" stop-color="currentColor" stop-opacity=".015"/></linearGradient></defs>' + grid + '<path d="' + area + '" fill="url(#' + id + '-fill)"/><path class="an-graph-line" d="' + path + '"/>' + circles + dates + '</svg>';
}

function breakdown(title, subtitle, rows, labelKey) {
  const biggest = rows.reduce((result, row) => Math.max(result, Math.abs(row.net)), 1);
  return '<section class="an-card an-breakdown"><header class="an-card-header"><div><h3>' + title + '</h3><p>' + subtitle + '</p></div></header>' + (rows.length ? '<div class="an-table-scroll"><table class="an-table"><thead><tr><th>Группа</th><th>Сделки</th><th>Win rate</th><th>Avg R</th><th>Net P&L</th></tr></thead><tbody>' + rows.map(row => '<tr><td><div class="an-group-name">' + escapeHTML(row[labelKey]) + '</div><div class="an-group-meter"><i class="' + tone(row.net) + '" style="width:' + (Math.abs(row.net) / biggest * 100).toFixed(1) + '%"></i></div></td><td>' + row.count + '</td><td>' + percent(row.winRate) + '</td><td>' + decimal(row.avgR) + (row.avgR === null ? '' : 'R') + '</td><td class="an-number ' + tone(row.net) + '">' + escapeHTML(signedMoney(row.net)) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="an-empty-small">Здесь появятся результаты закрытых сделок.</p>') + '</section>';
}

function monthParts(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, part] = month.split('-').map(Number);
  return year >= 1900 && year <= 9999 && part >= 1 && part <= 12 ? [year, part - 1] : null;
}

function renderCalendar(container, trades, analysis, initialMonth, onDaySelect) {
  let month = monthParts(initialMonth) ? initialMonth : (analysis.lastDate || dateKey(Date.now() / 1000)).slice(0, 7);
  const days = new Map(analysis.days.map(day => [day.date, day]));
  const render = () => {
    const [year, index] = monthParts(month), first = new Date(Date.UTC(year, index, 1));
    const leading = (first.getUTCDay() + 6) % 7, lastDay = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const monthRows = analysis.days.filter(day => day.date.startsWith(month)), count = monthRows.reduce((sum, day) => sum + day.count, 0), net = monthRows.reduce((sum, day) => sum + day.net, 0);
    const cells = Array.from({ length: Math.ceil((leading + lastDay) / 7) * 7 }, (_, i) => {
      const day = i - leading + 1;
      if (day < 1 || day > lastDay) return '<div class="an-calendar-outside" aria-hidden="true"></div>';
      const date = month + '-' + String(day).padStart(2, '0'), result = days.get(date);
      if (!result) return '<div class="an-calendar-day an-calendar-empty"><span>' + day + '</span></div>';
      return '<button type="button" class="an-calendar-day an-calendar-traded ' + tone(result.net) + '" data-day="' + date + '" aria-label="' + date + ', ' + result.count + ' сделок, ' + escapeHTML(money(result.net)) + '"><span>' + day + '</span><strong>' + escapeHTML(signedMoney(result.net)) + '</strong><small>' + result.count + ' ' + (result.count === 1 ? 'сделка' : result.count > 1 && result.count < 5 ? 'сделки' : 'сделок') + '</small></button>';
    }).join('');
    container.innerHTML = '<header class="an-card-header an-calendar-header"><div><h3>Календарь результатов</h3><p>День закрытия · New York</p></div><div class="an-month-nav"><button type="button" data-month-step="-1" aria-label="Предыдущий месяц">‹</button><strong>' + escapeHTML(monthFormat.format(first)) + '</strong><button type="button" data-month-step="1" aria-label="Следующий месяц">›</button></div></header><div class="an-month-summary"><span>' + (count ? count + ' закрытых сделок' : 'Нет закрытых сделок в этом месяце') + '</span>' + (count ? '<strong class="' + tone(net) + '">' + escapeHTML(signedMoney(net)) + '</strong>' : '') + '</div><div class="an-calendar-grid">' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => '<span class="an-calendar-weekday">' + day + '</span>').join('') + cells + '</div><div class="an-day-detail" hidden></div>';
    container.querySelectorAll('[data-month-step]').forEach(button => {
      button.onclick = () => { const next = new Date(Date.UTC(year, index + Number(button.dataset.monthStep), 1)); month = next.getUTCFullYear() + '-' + String(next.getUTCMonth() + 1).padStart(2, '0'); render(); };
    });
    container.querySelectorAll('[data-day]').forEach(button => {
      button.onclick = () => {
        const date = button.dataset.day;
        if (typeof onDaySelect === 'function') { onDaySelect(date); return; }
        container.querySelectorAll('[data-day]').forEach(item => item.classList.toggle('an-day-selected', item === button));
        const details = container.querySelector('.an-day-detail'), rows = filterTrades(trades, { from: date, to: date });
        details.hidden = false;
        details.innerHTML = '<div class="an-day-detail-header"><strong>' + date.split('-').reverse().join('.') + '</strong><button type="button" aria-label="Закрыть сделки дня">×</button></div><div class="an-table-scroll"><table class="an-table"><thead><tr><th>Инструмент</th><th>Направление</th><th>Время NY</th><th>Net P&L</th></tr></thead><tbody>' + rows.map(trade => '<tr><td>' + escapeHTML(trade.symbol) + '</td><td>' + (trade.side === 1 ? 'Long' : trade.side === -1 ? 'Short' : '—') + '</td><td>' + escapeHTML(nyTime.format(new Date(timestamp(trade.exitTime) * 1000))) + '</td><td class="' + tone(Number(trade.pnl)) + '">' + escapeHTML(signedMoney(Number(trade.pnl))) + '</td></tr>').join('') + '</tbody></table></div>';
        details.querySelector('button').onclick = () => { details.hidden = true; button.classList.remove('an-day-selected'); };
      };
    });
  };
  render();
}

/** Mounts an accessible analytics surface without chart libraries or generated results. */
export function renderAnalytics(container, trades, options = {}) {
  if (!container || typeof container.querySelector !== 'function') throw new TypeError('Analytics needs a DOM container.');
  const analysis = analyzeTrades(trades, options), id = 'analytics-' + ++renderId, empty = analysis.count === 0;
  const avgHold = analysis.avgHoldMinutes === null ? '—' : analysis.avgHoldMinutes < 60 ? decimal(analysis.avgHoldMinutes, 1) + ' мин' : decimal(analysis.avgHoldMinutes / 60, 1) + ' ч';
  const winDetail = empty ? 'После закрытия первой сделки' : analysis.wins + ' прибыльных / ' + analysis.losses + ' убыточных';
  container.innerHTML = '<div class="an-root"><div class="an-overview"><div><span class="an-eyebrow">PERFORMANCE</span><h2>Аналитика торговли</h2><p>' + (empty ? 'Ваши решения, измеренные в результатах.' : analysis.count + ' закрытых сделок · ' + analysis.firstDate + ' — ' + analysis.lastDate) + '</p></div><span class="an-scope">Закрытые сделки · USD</span></div>' +
    (empty ? '<div class="an-empty-state"><span class="an-empty-icon">↗</span><div><h3>Пока нет закрытых сделок</h3><p>Откройте сессию, проведите сделку и закройте позицию. Здесь появятся реальные результаты вашего бэктеста.</p></div></div>' : '') +
    '<div class="an-stats">' +
    stat('Net P&L', empty ? '—' : escapeHTML(signedMoney(analysis.net)), empty ? 'Нет результатов' : 'После торговых издержек', tone(analysis.net)) +
    stat('Win rate', percent(analysis.winRate), winDetail) +
    stat('Profit factor', decimal(analysis.pf), 'Прибыль / абсолютный убыток') +
    stat('Expectancy', escapeHTML(money(analysis.expectancy)), 'Средний net P&L на сделку', tone(analysis.expectancy)) +
    stat('Средний R', decimal(analysis.avgR) + (analysis.avgR === null ? '' : 'R'), analysis.rCount + ' сделок с известным риском') +
    stat('Макс. просадка', empty ? '—' : escapeHTML(money(analysis.maxClosedDrawdown)), 'Только по закрытым сделкам', empty ? '' : 'an-negative') +
    '</div><div class="an-secondary-stats"><span>Сделок <strong>' + analysis.count + '</strong></span><span>Среднее удержание <strong>' + avgHold + '</strong></span><span>Серия побед <strong>' + analysis.maxWinStreak + '</strong></span><span>Серия убытков <strong>' + analysis.maxLossStreak + '</strong></span><span>Безубыток <strong>' + analysis.breakeven + '</strong></span></div>' +
    '<div class="an-chart-grid"><section class="an-card"><header class="an-card-header"><div><h3>Кривая капитала</h3><p>Стартовый капитал ' + escapeHTML(money(analysis.capital)) + '</p></div><strong class="an-chart-total">' + (empty ? '—' : escapeHTML(money(analysis.endingBalance))) + '</strong></header>' + graph(analysis.equity, 'balance', id + '-equity', 'Баланс появится после закрытия сделки') + '</section><section class="an-card"><header class="an-card-header"><div><h3>Просадка</h3><p>От максимума закрытого баланса</p></div><strong class="an-chart-total ' + (empty ? '' : 'an-negative') + '">' + (empty ? '—' : '−' + escapeHTML(money(analysis.maxClosedDrawdown))) + '</strong></header>' + graph(analysis.equity, 'drawdown', id + '-drawdown', 'Просадка появится после закрытия сделки') + '</section></div>' +
    '<section class="an-card an-calendar"></section><div class="an-breakdown-grid">' + breakdown('По инструментам', 'Где формируется ваш результат', analysis.symbols, 'symbol') + breakdown('По дням недели', 'День закрытия сделки в New York', analysis.weekdays, 'label') + '</div>' + breakdown('По стратегиям', 'Сравнение сетапов по реальным сделкам', analysis.strategies, 'name') +
    '<p class="an-method-note">Win rate включает все закрытые сделки. Средний R исключает сделки без сохранённого начального риска. Просадка не отражает плавающий P&L внутри открытой позиции.' + (analysis.skipped ? ' Не включено незакрытых или некорректных записей: ' + analysis.skipped + '.' : '') + '</p></div>';
  renderCalendar(container.querySelector('.an-calendar'), trades, analysis, options.month, options.onDaySelect);
  return analysis;
}

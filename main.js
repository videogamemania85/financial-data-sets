// ── Korean Indices Dashboard ─────────────────────────────────────────────────

const KI_CONFIG = {
  KOSPI: [
    { symbol: '^KS11',  name: 'KOSPI 종합',  sub: 'Composite' },
    { symbol: '^KS200', name: 'KOSPI 200',   sub: 'Top 200' },
    { symbol: '^KS100', name: 'KOSPI 100',   sub: 'Top 100' },
    { symbol: '^KS50',  name: 'KOSPI 50',    sub: 'Top 50' },
  ],
  KOSDAQ: [
    { symbol: '^KQ11',  name: 'KOSDAQ 종합', sub: 'Composite' },
    { symbol: '^KQ150', name: 'KOSDAQ 150',  sub: 'Top 150' },
  ],
  KRX: [
    { symbol: '^KRX300', name: 'KRX 300', sub: 'Combined 300' },
  ],
};

const kiSparklines = {};
let kiData = {};
let kiActiveTab = 'ALL';

function drawKiSparkline(canvasId, prices, isPositive) {
  if (kiSparklines[canvasId]) kiSparklines[canvasId].destroy();
  const color = isPositive ? '#34d399' : '#f87171';
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  kiSparklines[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: prices.map((_, i) => i),
      datasets: [{ data: prices, borderColor: color, borderWidth: 1.5,
        fill: true, backgroundColor: color + '18', pointRadius: 0, tension: 0.3 }]
    },
    options: {
      responsive: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

function renderKiGrid() {
  const grid = document.getElementById('kiGrid');
  const allGroups = kiActiveTab === 'ALL'
    ? Object.entries(KI_CONFIG)
    : [[kiActiveTab, KI_CONFIG[kiActiveTab]]];

  grid.innerHTML = allGroups.map(([group, indices]) => `
    <div class="ki-group">
      <div class="ki-group-label">${group}</div>
      <div class="ki-cards">
        ${indices.map(cfg => {
          const d = kiData[cfg.symbol];
          if (!d || d.error) {
            return `
              <div class="ki-card ki-card--error">
                <div class="ki-card-name">${cfg.name}</div>
                <div class="ki-card-sub">${cfg.sub}</div>
                <div class="ki-card-nodata">데이터 없음</div>
              </div>`;
          }
          const isPos = d.change >= 0;
          const sign  = isPos ? '+' : '';
          const canvasId = `ki-spark-${cfg.symbol.replace('^', '')}`;
          return `
            <div class="ki-card ${isPos ? 'ki-card--pos' : 'ki-card--neg'}">
              <div class="ki-card-header">
                <div>
                  <div class="ki-card-name">${cfg.name}</div>
                  <div class="ki-card-sub">${cfg.sub}</div>
                </div>
                <div class="ki-card-price-block">
                  <div class="ki-card-price">${d.price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="ki-card-change ${isPos ? 'positive' : 'negative'}">${sign}${d.change.toFixed(2)} (${sign}${d.changePct.toFixed(2)}%)</div>
                </div>
              </div>
              <div class="ki-card-range">고가 ${d.dayHigh?.toFixed(2) ?? '—'} · 저가 ${d.dayLow?.toFixed(2) ?? '—'}</div>
              <canvas id="${canvasId}" class="ki-sparkline"></canvas>
            </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  // Draw sparklines after DOM is ready
  allGroups.forEach(([, indices]) => {
    indices.forEach(cfg => {
      const d = kiData[cfg.symbol];
      if (!d || d.error || !d.closes?.length) return;
      const canvasId = `ki-spark-${cfg.symbol.replace('^', '')}`;
      drawKiSparkline(canvasId, d.closes, d.change >= 0);
    });
  });
}

async function loadKoreanIndices() {
  const btn = document.getElementById('kiRefreshBtn');
  btn.classList.add('spinning');
  try {
    const res = await fetch('/api/korean-indices');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    arr.forEach(item => { kiData[item.symbol] = item; });
    renderKiGrid();
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('kiUpdateTime').textContent = `업데이트: ${now}`;
  } catch (err) {
    console.error('Korean indices fetch failed:', err);
    document.getElementById('kiUpdateTime').textContent = '로드 실패';
  } finally {
    btn.classList.remove('spinning');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadKoreanIndices();
  setInterval(loadKoreanIndices, 60_000);
  document.getElementById('kiRefreshBtn').addEventListener('click', loadKoreanIndices);
  document.querySelectorAll('.ki-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ki-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      kiActiveTab = tab.dataset.tab;
      renderKiGrid();
    });
  });
});

// ── Market Overview (Real-time via Yahoo Finance) ──────────────────────────

const INDICES = [
  { symbol: '^KS11', id: 'KS11',  name: 'KOSPI'   },
  { symbol: '^KQ11', id: 'KQ11',  name: 'KOSDAQ'  },
  { symbol: '^IXIC', id: 'IXIC',  name: 'NASDAQ'  },
  { symbol: '^GSPC', id: 'GSPC',  name: 'S&P 500' },
];

// Cloudflare Pages Function at /api/market proxies Yahoo Finance (no CORS)
const sparklineCharts = {};

function drawSparkline(canvas, prices, isPositive) {
  if (sparklineCharts[canvas.id]) sparklineCharts[canvas.id].destroy();
  const color = isPositive ? '#34d399' : '#f87171';
  sparklineCharts[canvas.id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: prices.map((_, i) => i),
      datasets: [{ data: prices, borderColor: color, borderWidth: 1.5,
        fill: true, backgroundColor: color + '18',
        pointRadius: 0, tension: 0.3 }]
    },
    options: {
      responsive: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

function renderIndexCard(card, data) {
  const { price, change, changePct, dayHigh, dayLow, closes } = data;
  const isPos = change >= 0;
  const sign  = isPos ? '+' : '';

  card.querySelector('.index-price').textContent =
    price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const chgEl = card.querySelector('.index-change');
  chgEl.textContent = `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
  chgEl.className = 'index-change ' + (isPos ? 'positive' : 'negative');

  card.querySelector('.index-range').textContent =
    `H ${dayHigh?.toFixed(2) ?? '—'}  L ${dayLow?.toFixed(2) ?? '—'}`;

  if (closes?.length) {
    const canvas = card.querySelector('.sparkline');
    canvas.id = `spark-${card.id}`;
    drawSparkline(canvas, closes, isPos);
  }
}

async function loadMarketOverview() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spinning');

  try {
    const res = await fetch('/api/market');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    data.forEach(item => {
      if (item.error) return;
      const idx = INDICES.find(i => i.symbol === item.symbol);
      if (!idx) return;
      const card = document.getElementById(`idx-${idx.id}`);
      if (!card) return;
      renderIndexCard(card, item);
    });

    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('marketUpdateTime').textContent = `업데이트: ${now}`;
  } catch (err) {
    console.error('Market data fetch failed:', err);
    document.getElementById('marketUpdateTime').textContent = '데이터 로드 실패';
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// Auto-refresh every 60 seconds
document.addEventListener('DOMContentLoaded', () => {
  loadMarketOverview();
  setInterval(loadMarketOverview, 60_000);
  document.getElementById('refreshBtn').addEventListener('click', loadMarketOverview);
});

// ── Static Stock Data ──────────────────────────────────────────────────────
// Static financial data (fetched 2026-03-12, no API key required)
const STATIC_DATA = {
  AAPL: {
    facts: {
      ticker: "AAPL", name: "Apple Inc", sector: "Information Technology",
      industry: "Technology Hardware, Storage & Peripherals",
      exchange: "NASDAQ", location: "California; U.S.A", is_active: true
    },
    snapshot: { price: 255, day_change: -5.83, day_change_percent: -2.24 },
    statements: [
      { fiscal_period:"2025-FY", revenue:416161000000, cost_of_revenue:220960000000, gross_profit:195201000000, operating_income:133050000000, net_income:112010000000, earnings_per_share_diluted:7.46 },
      { fiscal_period:"2024-FY", revenue:391035000000, cost_of_revenue:210352000000, gross_profit:180683000000, operating_income:123216000000, net_income:93736000000,  earnings_per_share_diluted:6.08 },
      { fiscal_period:"2023-FY", revenue:383285000000, cost_of_revenue:214137000000, gross_profit:169148000000, operating_income:114301000000, net_income:96995000000,  earnings_per_share_diluted:6.13 },
      { fiscal_period:"2022-FY", revenue:394328000000, cost_of_revenue:223546000000, gross_profit:170782000000, operating_income:119437000000, net_income:99803000000,  earnings_per_share_diluted:6.11 },
    ]
  },
  MSFT: {
    facts: {
      ticker: "MSFT", name: "Microsoft Corp", sector: "Information Technology",
      industry: "Software", exchange: "NASDAQ", location: "Washington; U.S.A", is_active: true
    },
    snapshot: { price: 403.53, day_change: -2.23, day_change_percent: -0.55 },
    statements: [
      { fiscal_period:"2025-FY", revenue:281724000000, cost_of_revenue:87831000000, gross_profit:193893000000, operating_income:128528000000, net_income:101832000000, earnings_per_share_diluted:13.64 },
      { fiscal_period:"2024-FY", revenue:245122000000, cost_of_revenue:74114000000, gross_profit:171008000000, operating_income:109433000000, net_income:88136000000,  earnings_per_share_diluted:11.80 },
      { fiscal_period:"2023-FY", revenue:211915000000, cost_of_revenue:65863000000, gross_profit:146052000000, operating_income:88523000000,  net_income:72361000000,  earnings_per_share_diluted:9.68  },
      { fiscal_period:"2022-FY", revenue:198270000000, cost_of_revenue:62650000000, gross_profit:135620000000, operating_income:83383000000,  net_income:72738000000,  earnings_per_share_diluted:9.65  },
    ]
  },
  TSLA: {
    facts: {
      ticker: "TSLA", name: "Tesla Inc", sector: "Consumer Discretionary",
      industry: "Automobiles", exchange: "NASDAQ", location: "California; U.S.A", is_active: true
    },
    snapshot: { price: 396.9, day_change: -2.34, day_change_percent: -0.59 },
    statements: [
      { fiscal_period:"2025-FY", revenue:94827000000,  cost_of_revenue:77733000000, gross_profit:17094000000, operating_income:4355000000,  net_income:3794000000,  earnings_per_share_diluted:1.08 },
      { fiscal_period:"2024-FY", revenue:97690000000,  cost_of_revenue:80240000000, gross_profit:17450000000, operating_income:7076000000,  net_income:7091000000,  earnings_per_share_diluted:2.04 },
      { fiscal_period:"2023-FY", revenue:96773000000,  cost_of_revenue:79113000000, gross_profit:17660000000, operating_income:8891000000,  net_income:14997000000, earnings_per_share_diluted:4.30 },
      { fiscal_period:"2022-FY", revenue:81462000000,  cost_of_revenue:60609000000, gross_profit:20853000000, operating_income:13656000000, net_income:12556000000, earnings_per_share_diluted:3.62 },
    ]
  },
  GOOGL: {
    facts: {
      ticker: "GOOGL", name: "Alphabet Inc", sector: "Communication Services",
      industry: "Interactive Media & Services", exchange: "NASDAQ", location: "California; U.S.A", is_active: true
    },
    snapshot: { price: 302.7, day_change: -4.34, day_change_percent: -1.41 },
    statements: [
      { fiscal_period:"FY2025", revenue:402836000000, cost_of_revenue:162535000000, gross_profit:240301000000, operating_income:129039000000, net_income:132170000000, earnings_per_share_diluted:10.81 },
      { fiscal_period:"2024-FY", revenue:350018000000, cost_of_revenue:146306000000, gross_profit:203712000000, operating_income:112390000000, net_income:100118000000, earnings_per_share_diluted:8.04  },
      { fiscal_period:"2023-FY", revenue:307394000000, cost_of_revenue:133332000000, gross_profit:174062000000, operating_income:84293000000,  net_income:73795000000,  earnings_per_share_diluted:5.80  },
      { fiscal_period:"2022-FY", revenue:282836000000, cost_of_revenue:126203000000, gross_profit:156633000000, operating_income:74842000000,  net_income:59972000000,  earnings_per_share_diluted:4.56  },
    ]
  },
  NVDA: {
    facts: {
      ticker: "NVDA", name: "Nvidia Corp", sector: "Information Technology",
      industry: "Semiconductors & Semiconductor Equipment", exchange: "NASDAQ", location: "California; U.S.A", is_active: true
    },
    snapshot: { price: 182.07, day_change: -2.7, day_change_percent: -1.46 },
    statements: [
      { fiscal_period:"2026-FY", revenue:215938000000, cost_of_revenue:62475000000,  gross_profit:153463000000, operating_income:130387000000, net_income:120067000000, earnings_per_share_diluted:4.90 },
      { fiscal_period:"2025-FY", revenue:130497000000, cost_of_revenue:32639000000,  gross_profit:97858000000,  operating_income:81453000000,  net_income:72880000000,  earnings_per_share_diluted:2.94 },
      { fiscal_period:"2024-FY", revenue:60922000000,  cost_of_revenue:16621000000,  gross_profit:44301000000,  operating_income:32972000000,  net_income:29760000000,  earnings_per_share_diluted:1.19 },
      { fiscal_period:"2023-FY", revenue:26974000000,  cost_of_revenue:11618000000,  gross_profit:15356000000,  operating_income:4224000000,   net_income:4368000000,   earnings_per_share_diluted:0.17 },
    ]
  }
};

const TICKERS = Object.keys(STATIC_DATA);

let revenueChart = null;
let netIncomeChart = null;

function fmt(num) {
  if (num == null) return '—';
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6)  return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString();
}
function fmtUSD(num) { return num == null ? '—' : '$' + fmt(num); }

function showError(msg) {
  const el = document.getElementById('error');
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

function renderCompany(facts, snapshot) {
  document.getElementById('companyName').textContent     = facts.name;
  document.getElementById('companyTicker').textContent   = facts.ticker;
  document.getElementById('companyExchange').textContent = facts.exchange;
  document.getElementById('companySector').textContent   = facts.sector;
  document.getElementById('companyIndustry').textContent = facts.industry;
  document.getElementById('companyLocation').textContent = facts.location;
  document.getElementById('companyStatus').textContent   = facts.is_active ? 'Active' : 'Inactive';

  document.getElementById('stockPrice').textContent = '$' + snapshot.price.toFixed(2);
  const sign = snapshot.day_change >= 0 ? '+' : '';
  const changeEl = document.getElementById('stockChange');
  changeEl.textContent = `${sign}${snapshot.day_change.toFixed(2)} (${sign}${snapshot.day_change_percent.toFixed(2)}%)`;
  changeEl.className = 'change ' + (snapshot.day_change >= 0 ? 'positive' : 'negative');
}

function renderMetrics(statements) {
  const s = statements[0];
  document.getElementById('metricRevenue').textContent    = fmtUSD(s.revenue);
  document.getElementById('metricNetIncome').textContent  = fmtUSD(s.net_income);
  document.getElementById('metricEPS').textContent        = s.earnings_per_share_diluted != null ? '$' + s.earnings_per_share_diluted.toFixed(2) : '—';
  const margin = s.gross_profit && s.revenue ? ((s.gross_profit / s.revenue) * 100).toFixed(1) + '%' : '—';
  document.getElementById('metricGrossMargin').textContent = margin;
}

function renderCharts(statements) {
  const rev = [...statements].reverse();
  const labels   = rev.map(s => s.fiscal_period);
  const revenues = rev.map(s => s.revenue / 1e9);
  const incomes  = rev.map(s => s.net_income / 1e9);

  if (revenueChart)   revenueChart.destroy();
  if (netIncomeChart) netIncomeChart.destroy();

  const commonOpts = () => ({
    responsive: true,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: '#1e2a3a' } },
      y: { ticks: { color: '#64748b', callback: v => '$' + v + 'B' }, grid: { color: '#1e2a3a' } }
    }
  });

  revenueChart = new Chart(document.getElementById('revenueChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Revenue (B USD)', data: revenues,
      backgroundColor: '#2563ebaa', borderColor: '#2563eb', borderWidth: 1, borderRadius: 6 }] },
    options: commonOpts()
  });

  netIncomeChart = new Chart(document.getElementById('netIncomeChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Net Income (B USD)', data: incomes,
      backgroundColor: '#059669aa', borderColor: '#059669', borderWidth: 1, borderRadius: 6 }] },
    options: commonOpts()
  });
}

function renderTable(statements) {
  document.getElementById('incomeTableBody').innerHTML = statements.map(s => `
    <tr>
      <td>${s.fiscal_period}</td>
      <td>${fmtUSD(s.revenue)}</td>
      <td>${fmtUSD(s.gross_profit)}</td>
      <td>${fmtUSD(s.operating_income)}</td>
      <td>${fmtUSD(s.net_income)}</td>
      <td>${s.earnings_per_share_diluted != null ? '$' + s.earnings_per_share_diluted.toFixed(2) : '—'}</td>
    </tr>
  `).join('');
}

function loadTicker(ticker) {
  ticker = ticker.trim().toUpperCase();
  showError('');

  const data = STATIC_DATA[ticker];
  if (!data) {
    showError(`"${ticker}" 데이터가 없습니다. 사용 가능한 티커: ${TICKERS.join(', ')}`);
    return;
  }

  renderCompany(data.facts, data.snapshot);
  renderMetrics(data.statements);
  renderCharts(data.statements);
  renderTable(data.statements);

  // highlight active button
  document.querySelectorAll('.ticker-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ticker === ticker);
  });
  document.getElementById('tickerInput').value = ticker;
}

// Render quick-select ticker buttons
function renderTickerButtons() {
  const container = document.getElementById('tickerButtons');
  container.innerHTML = TICKERS.map(t => `
    <button class="ticker-btn" data-ticker="${t}">${t}</button>
  `).join('');
  container.querySelectorAll('.ticker-btn').forEach(btn => {
    btn.addEventListener('click', () => loadTicker(btn.dataset.ticker));
  });
}

// Event listeners
document.getElementById('searchBtn').addEventListener('click', () => {
  loadTicker(document.getElementById('tickerInput').value);
});
document.getElementById('tickerInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadTicker(e.target.value);
});

renderTickerButtons();
loadTicker('AAPL');

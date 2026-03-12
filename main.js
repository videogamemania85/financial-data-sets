// Financial Datasets API
const API_BASE = 'https://api.financialdatasets.ai';
// Set your API key here or in localStorage as 'fd_api_key'
const API_KEY = localStorage.getItem('fd_api_key') || '';

let revenueChart = null;
let netIncomeChart = null;

async function fetchJSON(url) {
  const headers = API_KEY ? { 'X-API-KEY': API_KEY } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

function fmt(num) {
  if (num === null || num === undefined) return '—';
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (num / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6)  return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString();
}

function fmtUSD(num) {
  if (num === null || num === undefined) return '—';
  return '$' + fmt(num);
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showError(msg) {
  const el = document.getElementById('error');
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

function renderCompany(facts, snapshot) {
  document.getElementById('companyName').textContent = facts.name || '—';
  document.getElementById('companyTicker').textContent = facts.ticker || '—';
  document.getElementById('companyExchange').textContent = facts.exchange || '—';
  document.getElementById('companySector').textContent = facts.sector || '—';
  document.getElementById('companyIndustry').textContent = facts.industry || '—';
  document.getElementById('companyLocation').textContent = facts.location || '—';
  document.getElementById('companyStatus').textContent = facts.is_active ? 'Active' : 'Inactive';

  if (snapshot) {
    document.getElementById('stockPrice').textContent = '$' + snapshot.price.toFixed(2);
    const pct = snapshot.day_change_percent;
    const chg = snapshot.day_change;
    const sign = chg >= 0 ? '+' : '';
    const changeEl = document.getElementById('stockChange');
    changeEl.textContent = `${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
    changeEl.className = 'change ' + (chg >= 0 ? 'positive' : 'negative');
  }
}

function renderMetrics(statements) {
  if (!statements.length) return;
  const latest = statements[0];
  document.getElementById('metricRevenue').textContent = fmtUSD(latest.revenue);
  document.getElementById('metricNetIncome').textContent = fmtUSD(latest.net_income);
  document.getElementById('metricEPS').textContent = latest.earnings_per_share_diluted != null
    ? '$' + latest.earnings_per_share_diluted.toFixed(2) : '—';
  const margin = latest.gross_profit && latest.revenue
    ? ((latest.gross_profit / latest.revenue) * 100).toFixed(1) + '%'
    : '—';
  document.getElementById('metricGrossMargin').textContent = margin;
}

function renderCharts(statements) {
  const reversed = [...statements].reverse();
  const labels = reversed.map(s => s.fiscal_period || s.report_period);
  const revenues = reversed.map(s => s.revenue / 1e9);
  const netIncomes = reversed.map(s => s.net_income / 1e9);

  const chartDefaults = {
    borderRadius: 6,
    borderSkipped: false,
  };

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(document.getElementById('revenueChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (B USD)',
        data: revenues,
        backgroundColor: '#2563ebaa',
        borderColor: '#2563eb',
        borderWidth: 1,
        ...chartDefaults,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1e2a3a' } },
        y: { ticks: { color: '#64748b', callback: v => '$' + v + 'B' }, grid: { color: '#1e2a3a' } }
      }
    }
  });

  if (netIncomeChart) netIncomeChart.destroy();
  netIncomeChart = new Chart(document.getElementById('netIncomeChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net Income (B USD)',
        data: netIncomes,
        backgroundColor: '#059669aa',
        borderColor: '#059669',
        borderWidth: 1,
        ...chartDefaults,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1e2a3a' } },
        y: { ticks: { color: '#64748b', callback: v => '$' + v + 'B' }, grid: { color: '#1e2a3a' } }
      }
    }
  });
}

function renderTable(statements) {
  const tbody = document.getElementById('incomeTableBody');
  tbody.innerHTML = statements.map(s => `
    <tr>
      <td>${s.fiscal_period || s.report_period}</td>
      <td>${fmtUSD(s.revenue)}</td>
      <td>${fmtUSD(s.gross_profit)}</td>
      <td>${fmtUSD(s.operating_income)}</td>
      <td>${fmtUSD(s.net_income)}</td>
      <td>${s.earnings_per_share_diluted != null ? '$' + s.earnings_per_share_diluted.toFixed(2) : '—'}</td>
    </tr>
  `).join('');
}

async function loadTicker(ticker) {
  ticker = ticker.trim().toUpperCase();
  if (!ticker) return;

  showLoading(true);
  showError('');

  try {
    const [factsRes, snapshotRes, statementsRes] = await Promise.all([
      fetchJSON(`${API_BASE}/company/facts?ticker=${ticker}`),
      fetchJSON(`${API_BASE}/prices/snapshot?ticker=${ticker}`),
      fetchJSON(`${API_BASE}/financials/income-statements?ticker=${ticker}&period=annual&limit=4`),
    ]);

    const facts = factsRes;
    const snapshot = snapshotRes?.snapshot || snapshotRes;
    const statements = statementsRes?.income_statements || statementsRes || [];

    renderCompany(facts, snapshot);
    renderMetrics(statements);
    renderCharts(statements);
    renderTable(statements);
  } catch (err) {
    showError(`Failed to load data for "${ticker}". ${err.message}`);
  } finally {
    showLoading(false);
  }
}

// Event listeners
document.getElementById('searchBtn').addEventListener('click', () => {
  loadTicker(document.getElementById('tickerInput').value);
});

document.getElementById('tickerInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadTicker(e.target.value);
});

// Load default ticker
loadTicker('AAPL');

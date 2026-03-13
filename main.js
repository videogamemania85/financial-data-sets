// ── 시장 지수 (Yahoo Finance 프록시) ─────────────────────────────────────────

const INDICES = [
  { symbol: '^KS11', id: 'KS11', name: 'KOSPI'   },
  { symbol: '^KQ11', id: 'KQ11', name: 'KOSDAQ'  },
  { symbol: '^IXIC', id: 'IXIC', name: 'NASDAQ'  },
  { symbol: '^GSPC', id: 'GSPC', name: 'S&P 500' },
];

const sparklineCharts = {};

function drawSparkline(canvas, prices, isPositive) {
  if (sparklineCharts[canvas.id]) sparklineCharts[canvas.id].destroy();
  const color = isPositive ? '#34d399' : '#f87171';
  sparklineCharts[canvas.id] = new Chart(canvas, {
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
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
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
    btn.classList.remove('spinning');
  }
}

// ── KOSPI 전종목 (KRX 무료 API) ──────────────────────────────────────────────

let allStocks    = [];
let filteredStocks = [];
let sortCol = 'MKTCAP';
let sortDir = -1; // -1 = 내림차순, 1 = 오름차순
let currentPage = 1;
const PAGE_SIZE = 50;

function parseNum(str) {
  if (str == null || str === '') return 0;
  return parseFloat(String(str).replace(/,/g, '')) || 0;
}

function fmtKRW(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '조';
  if (n >= 1e8)  return Math.round(n / 1e8) + '억';
  return n.toLocaleString('ko-KR');
}

function fmtVol(n) {
  if (n >= 1e6)  return (n / 1e6).toFixed(1) + '백만';
  if (n >= 1e3)  return (n / 1e3).toFixed(0) + '천';
  return n.toLocaleString('ko-KR');
}

function renderStockTable() {
  const tbody = document.getElementById('stockTableBody');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredStocks.slice(start, start + PAGE_SIZE);

  if (filteredStocks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-placeholder">검색 결과가 없습니다.</td></tr>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = page.map(s => {
    const change = parseNum(s.CMPPREVDD_PRC);
    const rate   = parseNum(s.FLUC_RT);
    const isPos  = change > 0;
    const isNeg  = change < 0;
    const cls    = isPos ? 'positive' : isNeg ? 'negative' : '';
    const sign   = isPos ? '+' : '';
    const price  = parseNum(s.TDD_CLSPRC);
    return `
      <tr>
        <td class="td-code">${s.ISU_SRT_CD}</td>
        <td class="td-name">${s.ISU_ABBRV}</td>
        <td class="td-num">${price.toLocaleString('ko-KR')}</td>
        <td class="td-num ${cls}">${sign}${change.toLocaleString('ko-KR')}</td>
        <td class="td-num ${cls}">${sign}${rate.toFixed(2)}%</td>
        <td class="td-num">${fmtVol(parseNum(s.ACC_TRDVOL))}</td>
        <td class="td-num">${fmtKRW(parseNum(s.ACC_TRDVAL))}</td>
        <td class="td-num">${fmtKRW(parseNum(s.MKTCAP))}</td>
      </tr>`;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(filteredStocks.length / PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }

  const shown = new Set(
    [1, total, currentPage-2, currentPage-1, currentPage, currentPage+1, currentPage+2]
      .filter(p => p >= 1 && p <= total)
  );
  const sorted = [...shown].sort((a, b) => a - b);

  let html = `<button class="pg-btn" ${currentPage===1?'disabled':''} data-page="${currentPage-1}">&#8249;</button>`;
  let prev = 0;
  sorted.forEach(p => {
    if (p - prev > 1) html += `<span class="pg-ellipsis">…</span>`;
    html += `<button class="pg-btn${p===currentPage?' active':''}" data-page="${p}">${p}</button>`;
    prev = p;
  });
  html += `<button class="pg-btn" ${currentPage===total?'disabled':''} data-page="${currentPage+1}">&#8250;</button>`;
  pg.innerHTML = html;
}

function applyFilterSort() {
  const q = document.getElementById('stockSearch').value.trim().toLowerCase();
  filteredStocks = allStocks.filter(s =>
    !q ||
    s.ISU_SRT_CD.toLowerCase().includes(q) ||
    s.ISU_ABBRV.toLowerCase().includes(q)
  );
  const isText = sortCol === 'ISU_SRT_CD' || sortCol === 'ISU_ABBRV';
  filteredStocks.sort((a, b) => {
    const av = isText ? String(a[sortCol]).localeCompare(String(b[sortCol]), 'ko') : parseNum(a[sortCol]) - parseNum(b[sortCol]);
    return av * sortDir;
  });
  document.getElementById('stockCount').textContent =
    `${filteredStocks.length.toLocaleString('ko-KR')}개 종목`;
  renderStockTable();
}

async function loadKospiStocks() {
  const btn = document.getElementById('stockRefreshBtn');
  btn.classList.add('spinning');
  document.getElementById('stockError').classList.add('hidden');
  document.getElementById('stockTableBody').innerHTML =
    `<tr><td colspan="8" class="table-placeholder">데이터 로딩 중...</td></tr>`;
  try {
    const res = await fetch('/api/kospi');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    allStocks = json.stocks;
    currentPage = 1;
    applyFilterSort();
    const dateFormatted = json.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('stockUpdateTime').textContent =
      `기준일: ${dateFormatted} · 업데이트: ${now}`;
  } catch (err) {
    console.error('KOSPI stock fetch failed:', err);
    const el = document.getElementById('stockError');
    el.textContent = `데이터 로드 실패: ${err.message}`;
    el.classList.remove('hidden');
    document.getElementById('stockTableBody').innerHTML = '';
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── 초기화 ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 시장 지수
  loadMarketOverview();
  setInterval(loadMarketOverview, 60_000);
  document.getElementById('refreshBtn').addEventListener('click', loadMarketOverview);

  // KOSPI 전종목
  loadKospiStocks();
  setInterval(loadKospiStocks, 5 * 60_000); // 5분마다 갱신
  document.getElementById('stockRefreshBtn').addEventListener('click', loadKospiStocks);

  // 검색
  document.getElementById('stockSearch').addEventListener('input', () => {
    currentPage = 1;
    applyFilterSort();
  });

  // 컬럼 정렬
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir *= -1;
      } else {
        sortCol = col;
        sortDir = (col === 'ISU_SRT_CD' || col === 'ISU_ABBRV') ? 1 : -1;
      }
      document.querySelectorAll('th.sortable').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      currentPage = 1;
      applyFilterSort();
    });
  });

  // 기본 정렬 표시
  document.querySelector('th[data-col="MKTCAP"]')?.classList.add('sort-desc');

  // 페이지네이션
  document.getElementById('pagination').addEventListener('click', e => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page);
    renderStockTable();
    document.getElementById('stockTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

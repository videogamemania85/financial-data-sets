// ── 실시간 시계 & 장 상태 ──────────────────────────────────────────────────────

function getKSTDate() {
  // UTC+9
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst;
}

function updateClock() {
  const kst = getKSTDate();
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  document.getElementById('topbarClock').textContent = `KST ${hh}:${mm}:${ss}`;

  const weekday = kst.getUTCDay(); // 0=일, 6=토
  const hour    = kst.getUTCHours();
  const minute  = kst.getUTCMinutes();
  const timeNum = hour * 100 + minute; // HHMM 형식

  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  if (weekday === 0 || weekday === 6) {
    dot.className = 'status-dot closed';
    text.textContent = '휴장 (주말)';
  } else if (timeNum >= 900 && timeNum < 1530) {
    dot.className = 'status-dot open';
    text.textContent = '장 중';
  } else if (timeNum >= 800 && timeNum < 900) {
    dot.className = 'status-dot pre';
    text.textContent = '장전 동시호가';
  } else if (timeNum >= 1530 && timeNum < 1600) {
    dot.className = 'status-dot pre';
    text.textContent = '장후 동시호가';
  } else {
    dot.className = 'status-dot closed';
    text.textContent = '장 마감';
  }
}

function updateHeaderDate() {
  const kst = getKSTDate();
  const opts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' };
  document.getElementById('headerDate').textContent = kst.toLocaleDateString('ko-KR', opts);
}

// ── 시장 지수 ─────────────────────────────────────────────────────────────────

const INDICES = [
  { symbol: '^KS11', id: 'KS11', name: 'KOSPI'   },
  { symbol: '^KQ11', id: 'KQ11', name: 'KOSDAQ'  },
  { symbol: '^IXIC', id: 'IXIC', name: 'NASDAQ'  },
  { symbol: '^GSPC', id: 'GSPC', name: 'S&P 500' },
];

const sparklineCharts = {};

function drawSparkline(canvas, prices, isUp) {
  if (sparklineCharts[canvas.id]) sparklineCharts[canvas.id].destroy();
  const color = isUp ? '#f23645' : '#2979ff';
  sparklineCharts[canvas.id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: prices.map((_, i) => i),
      datasets: [{
        data: prices,
        borderColor: color,
        borderWidth: 1.5,
        fill: true,
        backgroundColor: color + '14',
        pointRadius: 0,
        tension: 0.3,
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

function renderIndexCard(card, data) {
  const { price, change, changePct, dayHigh, dayLow, closes } = data;
  const isUp   = change > 0;
  const isDown = change < 0;
  const sign   = isUp ? '+' : '';

  card.classList.toggle('is-up',   isUp);
  card.classList.toggle('is-down', isDown);

  card.querySelector('.index-price').textContent =
    price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const chgEl = card.querySelector('.index-change');
  chgEl.textContent = `${sign}${change.toFixed(2)}  ${sign}${changePct.toFixed(2)}%`;
  chgEl.className = 'index-change ' + (isUp ? 'up' : isDown ? 'down' : 'flat');

  card.querySelector('.index-range').textContent =
    `H ${dayHigh?.toFixed(2) ?? '—'}   L ${dayLow?.toFixed(2) ?? '—'}`;

  if (closes?.length) {
    const canvas = card.querySelector('.sparkline');
    canvas.id = `spark-${card.id}`;
    drawSparkline(canvas, closes, isUp);
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
      const idx  = INDICES.find(i => i.symbol === item.symbol);
      const card = idx && document.getElementById(`idx-${idx.id}`);
      if (card) renderIndexCard(card, item);
    });
    const now = getKSTDate();
    const ts  = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    document.getElementById('marketUpdateTime').textContent = `${ts} 업데이트`;
  } catch (err) {
    console.error('Market fetch failed:', err);
    document.getElementById('marketUpdateTime').textContent = '로드 실패';
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── KOSPI 전종목 (KRX API) ────────────────────────────────────────────────────

let allStocks      = [];
let filteredStocks = [];
let sortCol  = 'MKTCAP';
let sortDir  = -1;        // -1 내림차순, 1 오름차순
let curPage  = 1;
const PG = 50;

function num(str) {
  return parseFloat(String(str ?? '').replace(/,/g, '')) || 0;
}

function fmtKRW(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + '조';
  if (n >= 1e8)  return Math.round(n / 1e8)   + '억';
  if (n >= 1e4)  return Math.round(n / 1e4)   + '만';
  return n.toLocaleString('ko-KR');
}

function fmtVol(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '억';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '만';
  return n.toLocaleString('ko-KR');
}

function rateChip(rate, sign) {
  if (rate > 0)  return `<span class="chip-up">${sign}${rate.toFixed(2)}%</span>`;
  if (rate < 0)  return `<span class="chip-down">${rate.toFixed(2)}%</span>`;
  return `<span class="chip-flat">0.00%</span>`;
}

function renderTable() {
  const tbody = document.getElementById('stockTableBody');
  const slice = filteredStocks.slice((curPage - 1) * PG, curPage * PG);

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-placeholder">검색 결과가 없습니다.</td></tr>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map((s, idx) => {
    const price  = num(s.TDD_CLSPRC);
    const change = num(s.CMPPREVDD_PRC);
    const rate   = num(s.FLUC_RT);
    const isUp   = change > 0;
    const isDown = change < 0;
    const sign   = isUp ? '+' : '';
    const cls    = isUp ? 'up' : isDown ? 'down' : 'flat';

    return `<tr>
      <td class="td-code">${s.ISU_SRT_CD}</td>
      <td class="td-name">${s.ISU_ABBRV}</td>
      <td class="td-num">${price.toLocaleString('ko-KR')}</td>
      <td class="td-num ${cls}">${sign}${change.toLocaleString('ko-KR')}</td>
      <td class="td-num">${rateChip(rate, sign)}</td>
      <td class="td-num">${fmtVol(num(s.ACC_TRDVOL))}</td>
      <td class="td-num">${fmtKRW(num(s.ACC_TRDVAL))}</td>
      <td class="td-num">${fmtKRW(num(s.MKTCAP))}</td>
    </tr>`;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(filteredStocks.length / PG);
  const pg = document.getElementById('pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }

  const visible = new Set(
    [1, total, curPage - 2, curPage - 1, curPage, curPage + 1, curPage + 2]
      .filter(p => p >= 1 && p <= total)
  );
  const pages = [...visible].sort((a, b) => a - b);

  let html = `<button class="pg-btn" ${curPage === 1 ? 'disabled' : ''} data-page="${curPage - 1}">‹</button>`;
  let prev = 0;
  pages.forEach(p => {
    if (p - prev > 1) html += `<span class="pg-ellipsis">···</span>`;
    html += `<button class="pg-btn${p === curPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
    prev = p;
  });
  html += `<button class="pg-btn" ${curPage === total ? 'disabled' : ''} data-page="${curPage + 1}">›</button>`;
  pg.innerHTML = html;
}

function applyFilterSort() {
  const q = document.getElementById('stockSearch').value.trim().toLowerCase();
  const isText = sortCol === 'ISU_SRT_CD' || sortCol === 'ISU_ABBRV';

  filteredStocks = allStocks.filter(s =>
    !q || s.ISU_SRT_CD.toLowerCase().includes(q) || s.ISU_ABBRV.toLowerCase().includes(q)
  );
  filteredStocks.sort((a, b) => {
    const v = isText
      ? String(a[sortCol]).localeCompare(String(b[sortCol]), 'ko')
      : num(a[sortCol]) - num(b[sortCol]);
    return v * sortDir;
  });

  document.getElementById('stockCount').textContent = `${filteredStocks.length.toLocaleString('ko-KR')} 종목`;
  renderTable();
}

async function loadKospiStocks() {
  const btn = document.getElementById('stockRefreshBtn');
  btn.classList.add('spinning');
  document.getElementById('stockError').classList.add('hidden');
  document.getElementById('stockTableBody').innerHTML = `
    <tr><td colspan="8" class="table-placeholder">
      <div class="loading-wrap"><div class="spinner"></div><span>데이터 로딩 중...</span></div>
    </td></tr>`;

  try {
    const res = await fetch('/api/kospi');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    allStocks = json.stocks;
    curPage   = 1;
    applyFilterSort();

    const d = json.date;
    const dateStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const ts = getKSTDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    document.getElementById('stockUpdateTime').textContent = `기준일 ${dateStr} · ${ts} 업데이트`;
  } catch (err) {
    console.error('KOSPI stocks fetch failed:', err);
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
  // 시계 시작
  updateClock();
  updateHeaderDate();
  setInterval(updateClock, 1000);

  // 시장 지수
  loadMarketOverview();
  setInterval(loadMarketOverview, 60_000);
  document.getElementById('refreshBtn').addEventListener('click', loadMarketOverview);

  // KOSPI 전종목
  loadKospiStocks();
  setInterval(loadKospiStocks, 5 * 60_000);
  document.getElementById('stockRefreshBtn').addEventListener('click', loadKospiStocks);

  // 검색
  document.getElementById('stockSearch').addEventListener('input', () => {
    curPage = 1;
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
      curPage = 1;
      applyFilterSort();
    });
  });

  // 기본 정렬 표시
  document.querySelector('th[data-col="MKTCAP"]')?.classList.add('sort-desc');

  // 페이지네이션
  document.getElementById('pagination').addEventListener('click', e => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    curPage = parseInt(btn.dataset.page);
    renderTable();
    document.getElementById('stockSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

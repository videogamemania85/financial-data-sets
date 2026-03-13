// Cloudflare Pages Function — Naver Finance KOSPI 전종목 (무료, 인증 불필요)
// sosok=0: KOSPI, EUC-KR HTML 파싱

function parsePage(html) {
  const stocks = [];

  // 각 종목 행의 시작 위치를 찾아 순회
  const anchorRe = /code=(\d{6})" class="tltle">([^<]+)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const code = m[1];
    const name = m[2].trim();
    const start = m.index;
    // 현재 행 끝: 다음 종목 시작 또는 </tr>
    const nextMatch = html.indexOf('code=', start + 20);
    const end = nextMatch > 0 ? nextMatch : start + 3000;
    const seg = html.slice(start, end);

    // 현재가: 첫 번째 순수 숫자 td
    const priceM = seg.match(/<td class="number">([0-9,]+)<\/td>/);
    const price = priceM ? priceM[1] : '';

    // 전일비 방향
    const isUp   = seg.includes('bu_pup');
    const isFlat = seg.includes('bu_pdn0') || (!isUp && !seg.includes('bu_pdn'));

    // 전일비 금액 & 등락률
    const spans = [...seg.matchAll(/<span class="tah p11 nv01">\s*([^<]+?)\s*<\/span>/g)].map(s => s[1].trim());
    const changeAmt  = spans[0] ?? '0';
    const changeRate = spans[1] ?? '0.00%';

    const sign   = isUp ? '+' : isFlat ? '' : '-';
    const rawAmt = changeAmt.replace(/[^0-9,]/g, '');

    // 나머지 숫자들 (액면가, 거래량, 거래대금, PER, 시가총액, ...)
    const nums = [...seg.matchAll(/<td class="number">([0-9,]+(?:\.[0-9]+)?)<\/td>/g)].map(n => n[1]);
    // Naver 기본 컬럼 순서: 현재가, 액면가, 거래량, 거래대금, PER, 시가총액, ROE
    const volume    = nums[2] ?? '';
    const tradingVal = nums[3] ?? '';
    const marketCap = nums[5] ?? '';

    stocks.push({
      code,
      name,
      price,
      change:      `${sign}${rawAmt}`,
      changeRate:  isFlat ? '0.00%' : (isUp ? changeRate.replace(/^-/, '+') : changeRate),
      volume,
      tradingVal,
      marketCap,
    });
  }

  return stocks;
}

function getTotalPages(html) {
  const nums = [...html.matchAll(/page=(\d+)/g)].map(m => parseInt(m[1]));
  return nums.length > 0 ? Math.max(...nums) : 1;
}

export async function onRequest() {
  const BASE = 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=';
  const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

  try {
    // 1페이지 먼저 가져와서 총 페이지 수 파악
    const res1 = await fetch(BASE + '1', { headers: HEADERS });
    const buf1 = await res1.arrayBuffer();
    const html1 = new TextDecoder('euc-kr').decode(buf1);
    const totalPages = Math.min(getTotalPages(html1), 50); // 최대 50페이지

    // 나머지 페이지 병렬 fetch
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetch(BASE + (i + 2), { headers: HEADERS })
          .then(r => r.arrayBuffer())
          .then(b => new TextDecoder('euc-kr').decode(b))
          .catch(() => '')
      )
    );

    const allHtmls = [html1, ...rest];
    const allStocks = allHtmls.flatMap(parsePage);

    // 중복 제거 (같은 code가 여러 페이지에 나올 수 있음)
    const seen = new Set();
    const unique = allStocks.filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code);
      return true;
    });

    const today = new Date();
    const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10).replace(/-/g, '');

    return new Response(JSON.stringify({ date: dateStr, total: unique.length, stocks: unique }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

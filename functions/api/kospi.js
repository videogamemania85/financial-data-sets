// Cloudflare Pages Function — KRX 전종목 시세 (무료, 인증 불필요)
export async function onRequest() {
  // 오늘부터 최대 7일 전까지 거래일 탐색
  const today = new Date();

  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBack);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');

    try {
      const body = new URLSearchParams({
        bld:          'dbms/MDC/STAT/standard/MDCSTAT01901',
        locale:       'ko_KR',
        mktId:        'STK',   // KOSPI
        trdDd:        dateStr,
        money:        '1',
        csvxls_isNo:  'false',
      });

      const res = await fetch(
        'https://www.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer':      'https://www.krx.co.kr/',
            'Origin':       'https://www.krx.co.kr',
            'Accept':       'application/json, text/javascript, */*; q=0.01',
          },
          body: body.toString(),
        }
      );

      const json = await res.json();
      const stocks = json?.OutBlock_1;

      if (stocks && stocks.length > 0) {
        return new Response(JSON.stringify({ date: dateStr, stocks }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        });
      }
    } catch (_) {
      // 다음 날짜 시도
    }
  }

  return new Response(JSON.stringify({ error: '데이터를 불러올 수 없습니다.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

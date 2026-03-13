// Cloudflare Pages Function — proxies Yahoo Finance for Korean market indices
export async function onRequest() {
  const symbols = [
    '^KS11',   // KOSPI 종합
    '^KS200',  // KOSPI 200
    '^KS100',  // KOSPI 100
    '^KS50',   // KOSPI 50
    '^KQ11',   // KOSDAQ 종합
    '^KQ150',  // KOSDAQ 150
    '^KRX300', // KRX 300
  ];

  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=3mo`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await res.json();
        const result = json.chart?.result?.[0];
        if (!result) return { symbol: sym, error: 'No data' };

        const meta   = result.meta;
        const closes = result.indicators?.quote?.[0]?.close?.filter(v => v != null) ?? [];

        return {
          symbol:    sym,
          price:     meta.regularMarketPrice,
          prevClose: meta.chartPreviousClose,
          change:    meta.regularMarketPrice - meta.chartPreviousClose,
          changePct: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
          dayHigh:   meta.regularMarketDayHigh,
          dayLow:    meta.regularMarketDayLow,
          closes,
        };
      } catch (e) {
        return { symbol: sym, error: e.message };
      }
    })
  );

  return new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

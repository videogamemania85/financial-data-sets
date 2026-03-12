// Cloudflare Pages Function — proxies Yahoo Finance API (no CORS issues)
export async function onRequest() {
  const symbols = ['^KS11', '^KQ11', '^IXIC', '^GSPC'];

  // Fetch quote + 1-month sparkline for each symbol in parallel
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const json = await res.json();
        const result = json.chart?.result?.[0];
        if (!result) return { symbol: sym, error: 'No data' };

        const meta   = result.meta;
        const closes = result.indicators?.quote?.[0]?.close?.filter(v => v != null) ?? [];

        return {
          symbol:      sym,
          price:       meta.regularMarketPrice,
          prevClose:   meta.chartPreviousClose,
          change:      meta.regularMarketPrice - meta.chartPreviousClose,
          changePct:   ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
          dayHigh:     meta.regularMarketDayHigh,
          dayLow:      meta.regularMarketDayLow,
          marketTime:  meta.regularMarketTime,
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

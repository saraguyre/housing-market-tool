exports.handler = async (event) => {
  const zip = (event.queryStringParameters && event.queryStringParameters.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return json(400, { error: 'Invalid ZIP' });
  }

  const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
  if (!RENTCAST_API_KEY) {
    return json(500, { error: 'Missing RENTCAST_API_KEY environment variable' });
  }

  try {
    // First try market stats
    const marketRes = await fetch(`https://api.rentcast.io/v1/markets?zipCode=${zip}&dataType=Rental`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });

    if (marketRes.ok) {
      const data = await marketRes.json();
      const market = Array.isArray(data) ? data[0] : data;
      if (market && typeof market === 'object') {
        const rental = market.rentalData && typeof market.rentalData === 'object' ? market.rentalData : market;
        const liveRent = pickNumber([
          rental.averageRent, rental.avgRent, rental.medianRent,
          market.averageRent, market.avgRent, market.medianRent
        ]);
        const listingCount = pickNumber([
          rental.activeListings, rental.listingCount, rental.totalListings,
          market.activeListings, market.listingCount, market.totalListings
        ]);
        const lastUpdatedDate = rental.lastUpdatedDate || market.lastUpdatedDate || null;
        if (liveRent !== null) {
          return json(200, { liveRent, listingCount, lastUpdatedDate, source: 'markets' });
        }
      }
    }

    // Fallback to current rental listings
    const listingsRes = await fetch(`https://api.rentcast.io/v1/listings/rental/long-term?zipCode=${zip}&limit=25`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });

    if (!listingsRes.ok) {
      const body = await safeText(listingsRes);
      return json(listingsRes.status, { error: 'RentCast rejected listings request', detail: body });
    }

    const listingPayload = await listingsRes.json();
    const listings = Array.isArray(listingPayload)
      ? listingPayload
      : (Array.isArray(listingPayload.listings) ? listingPayload.listings : []);

    const prices = listings
      .map(item => pickNumber([
        item && item.price,
        item && item.listPrice,
        item && item.rent,
        item && item.monthlyRent,
        item && item.formattedPrice && String(item.formattedPrice).replace(/[^0-9.]/g, '')
      ]))
      .filter(v => v !== null);

    if (!prices.length) {
      return json(200, { liveRent: null, listingCount: 0, source: 'none' });
    }

    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const sorted = prices.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);

    return json(200, {
      liveRent: avg,
      medianRent: median,
      listingCount: prices.length,
      source: 'listings'
    });
  } catch (error) {
    return json(500, { error: 'RentCast proxy failed', detail: String(error) });
  }
};

function pickNumber(values) {
  for (const value of values) {
    const n = parseFloat(value);
    if (!isNaN(n)) return n;
  }
  return null;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

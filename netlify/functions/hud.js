exports.handler = async (event) => {
  const zip = (event.queryStringParameters && event.queryStringParameters.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return json(400, { error: 'Invalid ZIP' });
  }

  const HUD_TOKEN = process.env.HUD_TOKEN;
  const CENSUS_KEY = process.env.CENSUS_KEY;

  if (!HUD_TOKEN || !CENSUS_KEY) {
    return json(500, { error: 'Missing HUD_TOKEN or CENSUS_KEY environment variable' });
  }

  try {
    const [hudRes, vacancyRes, rentRes] = await Promise.all([
      fetch(`https://www.huduser.gov/hudapi/public/fmr/listFMRsByZipCode?zip_code=${zip}`, {
        headers: { Authorization: `Bearer ${HUD_TOKEN}` }
      }),
      fetch(`https://api.census.gov/data/2022/acs/acs5?get=B25004_001E,B25002_001E&for=zip%20code%20tabulation%20area:${zip}&key=${CENSUS_KEY}`),
      fetch(`https://api.census.gov/data/2022/acs/acs5?get=B25064_001E&for=zip%20code%20tabulation%20area:${zip}&key=${CENSUS_KEY}`)
    ]);

    const hud = hudRes.ok ? await hudRes.json() : null;
    const censusVacancy = vacancyRes.ok ? await vacancyRes.json() : null;
    const censusRent = rentRes.ok ? await rentRes.json() : null;

    return json(200, { hud, censusVacancy, censusRent });
  } catch (error) {
    return json(500, { error: 'HUD proxy failed', detail: String(error) });
  }
};

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

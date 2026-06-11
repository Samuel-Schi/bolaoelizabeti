const API_BASE = 'https://worldcup26.ir/get';
const RAW_BASE = 'https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main';

const RAW_FILES = {
  games: 'football.matches.json',
  groups: 'football.matchtables.json',
  teams: 'football.teams.json'
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: ${response.status}`);
  }

  return response.json();
}

exports.handler = async function handler(event) {
  const resource = event.queryStringParameters?.resource;

  if (!resource || !RAW_FILES[resource]) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Parâmetro resource inválido.' })
    };
  }

  try {
    const data = await fetchJson(`${API_BASE}/${resource}`);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(data)
    };
  } catch (liveError) {
    try {
      const fallback = await fetchJson(`${RAW_BASE}/${RAW_FILES[resource]}`);
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(fallback)
      };
    } catch (fallbackError) {
      return {
        statusCode: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          error: 'Não foi possível carregar os dados da Copa.',
          liveError: String(liveError),
          fallbackError: String(fallbackError)
        })
      };
    }
  }
};

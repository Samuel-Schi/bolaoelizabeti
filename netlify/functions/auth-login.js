const DEFAULT_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
};
const DEFAULT_ORACLE_LOGIN_URL = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/valida%C3%A7%C3%A3o_login';

function json(statusCode, body) {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body)
  };
}

function normalizeOracleUser(payload, login) {
  const user = payload?.user || payload?.data?.user || payload?.result?.user || payload?.profile || payload;

  return {
    id: String(user?.id || user?.user_id || user?.uuid || login),
    name: user?.name || user?.nome || user?.full_name || user?.display_name || login,
    login: user?.login || user?.username || user?.email || login
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Metodo nao permitido. Use POST.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Body JSON invalido.' });
  }

  const login = String(body.login || body.usuario || '').trim().toLowerCase();
  const password = String(body.password || body.senha || '').trim();

  if (!login || !password) {
    return json(400, { error: 'Campos login e senha sao obrigatorios.' });
  }

  const oracleUrl = process.env.ORACLE_LOGIN_URL || DEFAULT_ORACLE_LOGIN_URL;

  if (!oracleUrl) {
    return json(501, {
      error: 'ORACLE_LOGIN_URL nao configurada.',
      hint: 'Configure a URL da API Oracle para receber POST com login e password.'
    });
  }

  try {
    const response = await fetch(oracleUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(process.env.ORACLE_API_KEY ? { Authorization: `Bearer ${process.env.ORACLE_API_KEY}` } : {})
      },
      body: JSON.stringify({
        login,
        password,
        usuario: login,
        senha: password
      })
    });

    const rawText = await response.text();
    let payload = {};

    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = { raw: rawText };
    }

    if (!response.ok) {
      return json(response.status, {
        error: payload?.error || payload?.message || 'Falha no login Oracle.',
        details: payload
      });
    }

    return json(200, {
      success: true,
      user: normalizeOracleUser(payload, login),
      token: payload?.token || payload?.access_token || payload?.jwt || null,
      oracleResponse: payload
    });
  } catch (error) {
    return json(502, {
      error: 'Nao foi possivel conectar com a API Oracle.',
      details: String(error)
    });
  }
};

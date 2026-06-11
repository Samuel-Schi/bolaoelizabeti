const DEFAULT_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
};
const DEFAULT_ORACLE_REGISTER_URL = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/get_login';

function json(statusCode, body) {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body)
  };
}

function normalizeOracleUser(payload, name, login) {
  const user = payload?.user || payload?.data?.user || payload?.result?.user || payload?.profile || payload;

  return {
    id: String(user?.id || user?.user_id || user?.uuid || login),
    name: user?.name || user?.nome || user?.full_name || user?.display_name || name,
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

  const name = String(body.name || body.nome || '').trim();
  const login = String(body.login || body.usuario || '').trim().toLowerCase();
  const password = String(body.password || body.senha || '').trim();

  if (!name || !login || !password) {
    return json(400, { error: 'Campos name, login e password sao obrigatorios.' });
  }

  const oracleUrl = process.env.ORACLE_REGISTER_URL || DEFAULT_ORACLE_REGISTER_URL;

  if (!oracleUrl) {
    return json(501, {
      error: 'ORACLE_REGISTER_URL nao configurada.',
      hint: 'Configure a URL da API Oracle para receber POST com nome, login e senha.'
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
        name,
        login,
        password,
        nome: name,
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
        error: payload?.error || payload?.message || 'Falha no cadastro Oracle.',
        details: payload
      });
    }

    return json(200, {
      success: true,
      user: normalizeOracleUser(payload, name, login),
      oracleResponse: payload
    });
  } catch (error) {
    return json(502, {
      error: 'Nao foi possivel conectar com a API Oracle de cadastro.',
      details: String(error)
    });
  }
};

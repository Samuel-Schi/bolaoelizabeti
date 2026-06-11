const API = '/.netlify/functions/worldcup';
const ORACLE_LOGIN_API = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/valida%C3%A7%C3%A3o_login';
const ORACLE_REGISTER_API = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/get_login';
const ORACLE_PALPITES_API = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/post_palpites';
const ORACLE_GET_PALPITES_API = 'https://g6ddac1ab68a179-database01.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/bol%C3%A3odosasah/get_palpites_usuario';
const WORLDCUP_CDN = 'https://cdn.jsdelivr.net/gh/rezarahiminia/worldcup2026@main';

const LS = {
  games: 'bolao2026_games',
  groups: 'bolao2026_groups',
  teams: 'bolao2026_teams'
};

const SS = {
  session: 'bolao2026_session'
};

const SPECIAL_FLAG_CODES = {
  england: 'gb-eng',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  'northern ireland': 'gb-nir',
  'south korea': 'kr',
  'north korea': 'kp',
  'czech republic': 'cz',
  turkey: 'tr',
  'ivory coast': 'ci',
  'cape verde': 'cv',
  curacao: 'cw',
  'united states': 'us',
  iran: 'ir'
};

let predictions = {};
let rankingPredictions = {};
let games = JSON.parse(localStorage.getItem(LS.games) || '[]');
let groups = JSON.parse(localStorage.getItem(LS.groups) || '[]');
let teams = JSON.parse(localStorage.getItem(LS.teams) || '[]');
let currentUser = JSON.parse(sessionStorage.getItem(SS.session) || 'null');
let teamsById = {};
let loadingPredictions = false;
let loadingRanking = false;

const $ = id => document.getElementById(id);
const page = document.body.dataset.page || '';
let toastContainer = null;
let successPopup = null;

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function setSession(user) {
  currentUser = user || null;
  if (currentUser) sessionStorage.setItem(SS.session, JSON.stringify(currentUser));
  else {
    sessionStorage.removeItem(SS.session);
    predictions = {};
  }
}

function clearLegacyUserCache() {
  localStorage.removeItem('bolao2026_users');
  localStorage.removeItem('bolao2026_predictions');
}

function ensureToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function showToast(message, type = 'success') {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function ensureSuccessPopup() {
  if (successPopup) return successPopup;

  const overlay = document.createElement('div');
  overlay.className = 'site-popup-overlay';
  overlay.innerHTML = `
    <div class="site-popup" role="dialog" aria-modal="true" aria-labelledby="sitePopupTitle">
      <span class="site-popup-badge">Sucesso</span>
      <h3 id="sitePopupTitle">Palpite registrado</h3>
      <p id="sitePopupMessage"></p>
      <button type="button" class="site-popup-button">Fechar</button>
    </div>
  `;

  overlay.addEventListener('click', event => {
    if (event.target === overlay) overlay.classList.remove('show');
  });

  overlay.querySelector('.site-popup-button').addEventListener('click', () => {
    overlay.classList.remove('show');
  });

  document.body.appendChild(overlay);
  successPopup = overlay;
  return successPopup;
}

function showSuccessPopup(message) {
  const popup = ensureSuccessPopup();
  const messageEl = popup.querySelector('#sitePopupMessage');
  if (messageEl) messageEl.textContent = message;
  popup.classList.add('show');
}

function isDuplicatePredictionError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return (
    text.includes('duplic') ||
    text.includes('duplicate') ||
    text.includes('ora-00001') ||
    text.includes('unique constraint') ||
    text.includes('ja existe') ||
    text.includes('already exists')
  );
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao carregar ${url}`);
  return res.json();
}

async function getJsonWithParams(url, params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const finalUrl = query.toString() ? `${url}?${query.toString()}` : url;
  const res = await fetch(finalUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Erro ${res.status}`);
  }

  return data;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Erro ${res.status}`);
  }

  return data;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.games)) return data.games;
  if (Array.isArray(data.teams)) return data.teams;
  if (Array.isArray(data.groups)) return data.groups;
  return [];
}

function rebuildTeamIndex() {
  teamsById = Object.fromEntries(
    teams
      .filter(team => team && team.id)
      .map(team => [String(team.id), team])
  );
}

async function loadData(force = false) {
  if (!force && games.length && groups.length && teams.length) {
    rebuildTeamIndex();
    renderAll();
  }

  try {
    games = normalizeList(await getJson(`${API}?resource=games`));
    groups = normalizeList(await getJson(`${API}?resource=groups`));
    teams = normalizeList(await getJson(`${API}?resource=teams`));
  } catch (e) {
    console.warn('API ao vivo falhou. Usando CDN publico da Copa.', e);
    games = normalizeList(await getJson(`${WORLDCUP_CDN}/football.matches.json`));
    groups = normalizeList(await getJson(`${WORLDCUP_CDN}/football.matchtables.json`));
    teams = normalizeList(await getJson(`${WORLDCUP_CDN}/football.teams.json`));
  }

  localStorage.setItem(LS.games, JSON.stringify(games));
  localStorage.setItem(LS.groups, JSON.stringify(groups));
  localStorage.setItem(LS.teams, JSON.stringify(teams));
  rebuildTeamIndex();
  renderAll();
}

function validateLoginInput(login, password) {
  if (!login) return 'Informe o usuario para entrar.';
  if (login.includes(' ')) return 'O usuario/login nao pode ter espacos.';
  if (login.length < 3) return 'O usuario/login precisa ter pelo menos 3 caracteres.';
  if (!password) return 'Informe a senha para entrar.';
  if (password.length < 4) return 'A senha precisa ter pelo menos 4 caracteres.';
  return '';
}

function validateRegisterInput(name, login, password) {
  if (!name) return 'Informe o nome completo.';
  if (name.length < 3) return 'O nome precisa ter pelo menos 3 caracteres.';
  if (!login) return 'Informe o usuario/login.';
  if (login.includes(' ')) return 'O usuario/login nao pode ter espacos.';
  if (login.length < 3) return 'O usuario/login precisa ter pelo menos 3 caracteres.';
  if (!password) return 'Informe a senha.';
  if (password.length < 4) return 'A senha precisa ter pelo menos 4 caracteres.';
  return '';
}

function normalizeOracleUser(response, fallback = {}) {
  const user =
    response?.user ||
    response?.items?.[0] ||
    response?.items?.[0]?.user ||
    response?.data?.items?.[0] ||
    response?.data?.user ||
    response;

  const rawId = user?.id ?? user?.ID_USUARIO ?? user?.id_usuario ?? fallback.id ?? null;
  const normalizedId = rawId !== null && rawId !== undefined && rawId !== ''
    ? Number(rawId)
    : null;

  return {
    id: Number.isNaN(normalizedId) ? null : normalizedId,
    name: user?.name || user?.nome || user?.NOME || fallback.name || '',
    login: (user?.login || user?.usuario || user?.USUARIO || fallback.login || '').toLowerCase()
  };
}

async function registerWithApi(name, login, password) {
  const payload = {
    name,
    login,
    password,
    nome: name,
    usuario: login,
    senha: password
  };

  const response = await postJson(ORACLE_REGISTER_API, payload);
  const user = normalizeOracleUser(response, { name, login });
  if (!user.id) {
    throw new Error('A API de cadastro nao retornou ID_USUARIO numerico.');
  }
  return user;
}

async function loginWithApi(login, password) {
  const payload = {
    login,
    password,
    usuario: login,
    senha: password
  };

  const response = await postJson(ORACLE_LOGIN_API, payload);
  const user = normalizeOracleUser(response, { login });
  if (!user.id) {
    throw new Error('A API de login nao retornou ID_USUARIO numerico.');
  }
  return user;
}

function userLabel(user) {
  return user?.name || user?.login || 'Participante';
}

function normalizeTeamKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function teamName(obj, side) {
  const keys = side === 'home'
    ? ['home_team_name_en', 'home_team', 'homeTeam', 'team1', 'home', 'team_home', 'home_name']
    : ['away_team_name_en', 'away_team', 'awayTeam', 'team2', 'away', 'team_away', 'away_name'];

  for (const k of keys) {
    const v = obj[k];
    if (!v) continue;
    if (typeof v === 'string') return v;
    return v.name_en || v.name || v.country || v.title || JSON.stringify(v);
  }

  const teamId = side === 'home' ? obj.home_team_id : obj.away_team_id;
  const team = teamId ? teamsById[String(teamId)] : null;
  return team?.name_en || team?.name || (side === 'home' ? 'Time A' : 'Time B');
}

function findTeamByName(name) {
  const key = normalizeTeamKey(name);
  if (!key) return null;

  return teams.find(team => {
    const names = [team.name_en, team.name, team.country, team.team_name, team.fifa_code];
    return names.some(item => normalizeTeamKey(item) === key);
  }) || null;
}

function flagCodeFromTeam(team, fallbackName = '') {
  const iso2 = String(team?.iso2 || '').trim().toLowerCase();
  if (iso2) {
    if (iso2 === 'eng') return 'gb-eng';
    if (iso2 === 'sco') return 'gb-sct';
    if (iso2 === 'wal') return 'gb-wls';
    if (iso2 === 'nir') return 'gb-nir';
    return iso2;
  }

  return SPECIAL_FLAG_CODES[normalizeTeamKey(fallbackName || team?.name_en || team?.name || team?.country)] || '';
}

function teamFlag(team, fallbackName = '') {
  const code = flagCodeFromTeam(team, fallbackName);
  return team?.flag || (code ? `https://flagcdn.com/w80/${code}.png` : '');
}

function getTeamMetaById(teamId) {
  const team = teamId ? teamsById[String(teamId)] : null;
  return {
    name: team?.name_en || team?.name || team?.country || team?.team_name || 'Time',
    flag: teamFlag(team)
  };
}

function getTeamMetaByName(name) {
  const team = findTeamByName(name);
  return {
    name: name || team?.name_en || team?.name || 'Time',
    flag: teamFlag(team || {}, name)
  };
}

function teamBadge(name, flag, align = '') {
  const alignClass = align ? ` ${align}` : '';
  const media = flag
    ? `<img src="${flag}" alt="Bandeira de ${name}" loading="lazy">`
    : '<span class="team-badge-placeholder"></span>';

  return `<span class="team-badge${alignClass}">${media}<span>${name}</span></span>`;
}

function groupName(item) {
  return item.group || item.group_name || item.groupName || item.name || item.title || 'Grupo';
}

function gameGroup(game) {
  return game.group || game.group_name || game.groupName || game.stage || game.type || '';
}

function gameId(game, idx) {
  return game.id || game._id || game.match_id || game.game_id || `jogo-${idx}`;
}

function gameDate(game) {
  return game.local_date || game.date || game.match_date || game.datetime || game.time || 'Data a definir';
}

function isGameFinished(game) {
  const finished = String(game.finished || '').toUpperCase();
  const status = String(game.status || game.match_status || game.state || '').toLowerCase();
  const elapsed = String(game.time_elapsed || '').toLowerCase();

  return (
    finished === 'TRUE' ||
    ['finished', 'completed', 'final'].includes(status) ||
    ['finished', 'ft', 'fulltime'].includes(elapsed)
  );
}

function gameStatus(game) {
  if (isGameFinished(game)) return 'Encerrado';
  const elapsed = String(game.time_elapsed || '').toLowerCase();
  if (['live', 'inprogress', 'in_progress'].includes(elapsed)) return 'Ao vivo';
  if (hasScorerInfo(game)) return 'Ao vivo';
  return 'Aguardando';
}

function isGameLocked(game) {
  if (isGameFinished(game)) return true;

  const elapsed = String(game.time_elapsed || '').toLowerCase();
  const status = String(game.status || game.match_status || game.state || '').toLowerCase();
  if (['live', 'inprogress', 'in_progress'].includes(elapsed)) return true;
  if (['live', 'inprogress', 'in_progress', 'ongoing'].includes(status)) return true;
  return false;
}

function score(game, side) {
  const keys = side === 'home'
    ? ['home_score', 'homeScore', 'team1_score', 'score1', 'home_goals']
    : ['away_score', 'awayScore', 'team2_score', 'score2', 'away_goals'];

  for (const k of keys) {
    if (game[k] !== undefined && game[k] !== null && game[k] !== '') return Number(game[k]);
  }

  if (game.score && typeof game.score === 'object') {
    return side === 'home' ? Number(game.score.home) : Number(game.score.away);
  }

  return null;
}

function hasScorerInfo(game) {
  return Boolean(gameScorers(game, 'home') || gameScorers(game, 'away'));
}

function hasVisibleMatchScore(game) {
  const hg = score(game, 'home');
  const ag = score(game, 'away');
  return (isGameFinished(game) || hasScorerInfo(game) || gameStatus(game) === 'Ao vivo') && !Number.isNaN(hg) && !Number.isNaN(ag) && hg !== null && ag !== null;
}

function normalizeScorersText(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'null') return '';

  return raw
    .replace(/^\{+|\}+$/g, '')
    .replace(/[“”"]/g, '')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function gameScorers(game, side) {
  const keys = side === 'home'
    ? ['home_scorers', 'homeScorers', 'team1_scorers', 'home_scorer']
    : ['away_scorers', 'awayScorers', 'team2_scorers', 'away_scorer'];

  for (const key of keys) {
    const cleaned = normalizeScorersText(game[key]);
    if (cleaned) return cleaned;
  }

  return '';
}

function renderGameScorers(game) {
  const home = gameScorers(game, 'home');
  const away = gameScorers(game, 'away');

  if (!hasVisibleMatchScore(game) || (!home && !away)) return '';

  return `<div class="goal-scorers">
    ${home ? `<p><strong>${teamName(game, 'home')}:</strong> ${home}</p>` : ''}
    ${away ? `<p><strong>${teamName(game, 'away')}:</strong> ${away}</p>` : ''}
  </div>`;
}

function calcPoints(pred, game) {
  if (!pred || !isGameFinished(game)) return 0;

  const hg = score(game, 'home');
  const ag = score(game, 'away');
  if (hg === null || ag === null || Number.isNaN(hg) || Number.isNaN(ag)) return 0;

  const ph = Number(pred.home);
  const pa = Number(pred.away);
  if (Number.isNaN(ph) || Number.isNaN(pa)) return 0;

  if (ph === hg && pa === ag) return 10;

  const realResult = Math.sign(hg - ag);
  const predResult = Math.sign(ph - pa);
  let pts = realResult === predResult ? 5 : 0;
  if (ph === hg || pa === ag) pts += 2;
  return pts;
}

async function savePredictionToApi(game, gameIdValue, pred) {
  if (!currentUser?.id || Number.isNaN(Number(currentUser.id))) {
    throw new Error('Sessao invalida: o login precisa retornar ID_USUARIO numerico.');
  }

  const homeTeam = teamName(game, 'home');
  const awayTeam = teamName(game, 'away');
  const payload = {
    id_usuario: Number(currentUser.id),
    id_jogo: String(gameIdValue),
    grupo_jogo: gameGroup(game),
    time_casa: homeTeam,
    time_fora: awayTeam,
    gols_casa: Number(pred.home),
    gols_fora: Number(pred.away)
  };

  return postJson(ORACLE_PALPITES_API, payload);
}

function normalizePredictionRows(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.result)) return response.result;
  if (Array.isArray(response.rows)) return response.rows;
  return [];
}

function normalizePredictionOwner(row, fallbackUser = null) {
  const rawId = row?.ID_USUARIO ?? row?.id_usuario ?? fallbackUser?.id ?? '';
  if (rawId === '' || rawId === null || rawId === undefined) return null;

  const rawLogin = row?.USUARIO ?? row?.usuario ?? row?.LOGIN ?? row?.login ?? fallbackUser?.login ?? '';
  return {
    id: String(rawId),
    name: row?.NOME ?? row?.nome ?? row?.NAME ?? row?.name ?? fallbackUser?.name ?? `Participante ${rawId}`,
    login: String(rawLogin || fallbackUser?.login || `usuario${rawId}`).toLowerCase()
  };
}

function buildPredictionsByGame(items, fallbackUser = null) {
  const nextPredictions = {};

  items.forEach(row => {
    const idJogo = String(row?.ID_JOGO ?? row?.id_jogo ?? '');
    const user = normalizePredictionOwner(row, fallbackUser);
    if (!idJogo || !user?.id) return;

    const golsCasa = row?.GOLS_CASA ?? row?.gols_casa ?? '';
    const golsFora = row?.GOLS_FORA ?? row?.gols_fora ?? '';
    const timeCasa = row?.TIME_CASA ?? row?.time_casa ?? '';
    const timeFora = row?.TIME_FORA ?? row?.time_fora ?? '';

    nextPredictions[idJogo] ||= {};
    nextPredictions[idJogo][user.id] = {
      home: golsCasa === '' || golsCasa === null ? '' : Number(golsCasa),
      away: golsFora === '' || golsFora === null ? '' : Number(golsFora),
      user,
      teams: {
        home: timeCasa,
        away: timeFora
      }
    };
  });

  return nextPredictions;
}

function findGameIdByTeams(homeName, awayName) {
  const targetHome = normalizeTeamKey(homeName);
  const targetAway = normalizeTeamKey(awayName);
  if (!targetHome || !targetAway) return '';

  const game = games.find((item, idx) => {
    const gameHome = normalizeTeamKey(teamName(item, 'home'));
    const gameAway = normalizeTeamKey(teamName(item, 'away'));
    return gameHome === targetHome && gameAway === targetAway;
  });

  return game ? String(gameId(game, games.indexOf(game))) : '';
}

function remapPredictionsToCurrentGames(sourcePredictions) {
  const remapped = {};

  Object.entries(sourcePredictions || {}).forEach(([rawGameId, byUser]) => {
    const records = Object.values(byUser || {});
    const sample = records[0];
    const matchedGameId = findGameIdByTeams(sample?.teams?.home, sample?.teams?.away);
    const finalGameId = matchedGameId || String(rawGameId);

    remapped[finalGameId] ||= {};
    Object.assign(remapped[finalGameId], byUser);
  });

  return remapped;
}

function syncCurrentUserIntoRankingPredictions() {
  if (!currentUser?.id) return;

  Object.entries(predictions).forEach(([gameIdValue, byUser]) => {
    const mine = byUser?.[currentUser.id];
    if (!mine) return;

    rankingPredictions[gameIdValue] ||= {};
    rankingPredictions[gameIdValue][currentUser.id] = {
      ...mine,
      user: {
        id: String(currentUser.id),
        name: currentUser.name,
        login: currentUser.login
      }
    };
  });
}

function replacePredictionsForCurrentUser(items) {
  if (!currentUser?.id) return;
  predictions = remapPredictionsToCurrentGames(buildPredictionsByGame(items, currentUser));
  syncCurrentUserIntoRankingPredictions();
}

function replaceRankingPredictions(items) {
  rankingPredictions = buildPredictionsByGame(items);
  syncCurrentUserIntoRankingPredictions();
}

async function loadPredictionsFromApi() {
  if (!currentUser?.id) {
    predictions = {};
    return;
  }

  loadingPredictions = true;
  try {
    const response = await getJsonWithParams(ORACLE_GET_PALPITES_API, {
      id_usuario: currentUser.id
    });
    replacePredictionsForCurrentUser(normalizePredictionRows(response));
  } finally {
    loadingPredictions = false;
  }
}

async function loadRankingPredictionsFromApi() {
  loadingRanking = true;
  try {
    const response = await getJsonWithParams(ORACLE_GET_PALPITES_API);
    replaceRankingPredictions(normalizePredictionRows(response));
  } finally {
    loadingRanking = false;
  }
}

async function syncPredictionsAfterAuth(messageElementId = '') {
  try {
    await loadPredictionsFromApi();
    try {
      await loadRankingPredictionsFromApi();
    } catch (error) {
      console.warn('Ranking ainda nao respondeu apos autenticar.', error);
    }
  } catch (error) {
    console.warn('Nao foi possivel carregar os palpites do usuario apos autenticar.', error);
    const messageEl = messageElementId ? $(messageElementId) : null;
    if (messageEl) {
      messageEl.textContent += ' Login feito, mas a API de palpites ainda nao respondeu.';
    }
  }
}

function buildPredictionRoster() {
  const roster = new Map();

  Object.values(rankingPredictions).forEach(byUser => {
    Object.entries(byUser || {}).forEach(([userId, record]) => {
      if (record?.user?.login) {
        const normalizedUserId = String(userId);
        roster.set(normalizedUserId, {
          id: normalizedUserId,
          name: record.user.name,
          login: record.user.login
        });
      }
    });
  });

  if (currentUser?.id) roster.set(String(currentUser.id), { ...currentUser, id: String(currentUser.id) });
  return [...roster.values()];
}

function getRows() {
  const roster = buildPredictionRoster();

  return roster
    .map(user => {
      let pontos = 0;
      let palpites = 0;

      games.forEach((game, idx) => {
        const id = gameId(game, idx);
        const p = rankingPredictions[id]?.[user.id];
        if (p && p.home !== '' && p.away !== '') {
          palpites++;
          pontos += calcPoints(p, game);
        }
      });

      return { user, pontos, palpites };
    })
    .sort((a, b) => b.pontos - a.pontos);
}

function renderHeroSession() {
  const navLogout = $('btnLogoutNav');
  if (navLogout) navLogout.hidden = !currentUser;
}

function renderSessionPanel() {
  const panelStatus = $('statusSessao');
  const sessionState = $('sessionState');
  if (sessionState) sessionState.textContent = currentUser ? 'ON' : 'OFF';
  if (!panelStatus) return;

  if (!currentUser) {
    panelStatus.innerHTML = '<p class="muted">Nenhum usuario logado.</p>';
    return;
  }

  const rows = getRows();
  const currentUserId = String(currentUser.id);
  const row = rows.find(item => String(item.user.id) === currentUserId) || { pontos: 0, palpites: 0 };
  const rank = rows.findIndex(item => String(item.user.id) === currentUserId) + 1;

  panelStatus.innerHTML = `
    <div class="session-grid">
      <article class="session-stat">
        <strong>${userLabel(currentUser)}</strong>
        <span>@${currentUser.login}</span>
      </article>
      <article class="session-stat">
        <strong>${rank > 0 ? `#${rank}` : '--'}</strong>
        <span>posicao atual</span>
      </article>
      <article class="session-stat">
        <strong>${row.pontos}</strong>
        <span>pontos</span>
      </article>
      <article class="session-stat">
        <strong>${row.palpites}</strong>
        <span>palpites feitos</span>
      </article>
    </div>
  `;
}

function renderGroups() {
  if (!$('grupos')) return;
  const byGroup = {};

  if (groups.length) {
    groups.forEach(group => {
      const name = groupName(group);
      byGroup[name] ||= [];
      const list = group.teams || group.table || group.standings || [];
      if (Array.isArray(list) && list.length) {
        list.forEach(entry => {
          const team = teamsById[String(entry.team_id)] || entry;
          byGroup[name].push({
            name: team.name_en || team.name || team.team || team.country || team.team_name || 'Time',
            flag: teamFlag(team),
            pts: entry.pts ?? ''
          });
        });
      }
    });
  }

  if (!Object.keys(byGroup).length && teams.length) {
    teams.forEach(team => {
      const name = team.group || team.groups || team.group_name || 'Sem grupo';
      byGroup[name] ||= [];
      byGroup[name].push({
        name: team.name_en || team.name || team.country || team.team_name || 'Time',
        flag: teamFlag(team),
        pts: ''
      });
    });
  }

  $('grupos').innerHTML =
    Object.entries(byGroup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, list]) => `
          <div class="group-card">
            <h3>Grupo ${name}</h3>
            ${list.map(team => `
              <div class="team">
                ${teamBadge(team.name, team.flag)}
                <span>${team.pts !== '' ? `${team.pts} pts` : ''}</span>
              </div>
            `).join('')}
          </div>
        `
      )
      .join('') || '<p class="muted">Grupos ainda nao carregados.</p>';

  const select = $('filtroGrupo');
  if (!select) return;
  const current = select.value;
  const options = [''].concat([...new Set(Object.keys(byGroup))].sort());
  select.innerHTML = options.map(group => `<option value="${group}">${group || 'Todos os grupos'}</option>`).join('');
  select.value = current;
}

function getMyPrediction(gameIdValue) {
  if (!currentUser?.id) return { home: '', away: '' };
  return predictions[gameIdValue]?.[currentUser.id] || { home: '', away: '' };
}

function renderMatches() {
  if ($('totalJogos')) $('totalJogos').textContent = games.length;
  if (!$('jogos')) return;

  if (!currentUser) {
    $('jogos').innerHTML = `
      <div class="login-lock">
        <h3>Login obrigatorio</h3>
        <p>Entre com seu usuario para registrar palpites nesta tela.</p>
        <a class="button-link" href="registro.html">Ir para login</a>
      </div>
    `;
    if ($('totalMeusPalpites')) $('totalMeusPalpites').textContent = '0';
    return;
  }

  if (loadingPredictions) {
    $('jogos').innerHTML = '<p class="muted">Carregando seus palpites salvos...</p>';
    if ($('totalMeusPalpites')) $('totalMeusPalpites').textContent = '0';
    return;
  }

  const filtro = $('filtroGrupo') ? $('filtroGrupo').value : '';
  const filtered = games.filter(game => !filtro || gameGroup(game) === filtro);
  let meusPalpites = 0;

  $('jogos').innerHTML =
    filtered.map((game, idx) => {
      const id = gameId(game, idx);
      const pred = getMyPrediction(id);
      const hasPred = pred.home !== '' && pred.away !== '';
      if (hasPred) meusPalpites++;

      const hg = score(game, 'home');
      const ag = score(game, 'away');
      const scoreInline = hasVisibleMatchScore(game) ? `${hg} x ${ag}` : 'x';
      const placar = isGameFinished(game)
        ? `Resultado final: ${hg} x ${ag}`
        : hasVisibleMatchScore(game)
          ? `Placar atual: ${hg} x ${ag}`
          : 'Resultado ainda nao validado';
      const homeTeam = game.home_team_id ? getTeamMetaById(game.home_team_id) : getTeamMetaByName(teamName(game, 'home'));
      const awayTeam = game.away_team_id ? getTeamMetaById(game.away_team_id) : getTeamMetaByName(teamName(game, 'away'));
      const pts = calcPoints(pred, game);
      const locked = isGameLocked(game);
      const lockMessage = isGameFinished(game)
        ? 'Palpite encerrado: o jogo ja terminou.'
        : locked
          ? 'Palpite bloqueado: o jogo ja comecou ou esta acontecendo.'
          : '';

      return `<div class="match ${locked ? 'match-locked' : ''}">
        <div class="match-top"><span>${gameGroup(game) ? `Grupo ${gameGroup(game)}` : 'Fase'}</span><span>${gameDate(game)} • ${gameStatus(game)}</span></div>
        <div class="teams">${teamBadge(homeTeam.name, homeTeam.flag, 'home')}<span class="match-score-inline">${scoreInline}</span>${teamBadge(awayTeam.name, awayTeam.flag, 'away')}</div>
        ${renderGameScorers(game)}
        <div class="real-score">${placar}</div>
        <div class="solo-prediction">
          <label>${userLabel(currentUser)} <span>@${currentUser.login}</span></label>
          <div class="prediction-row">
            <input type="number" min="0" value="${pred.home}" onchange="setPredictionValue('${id}', 'home', this.value)" ${locked ? 'disabled' : ''}>
            <span>x</span>
            <input type="number" min="0" value="${pred.away}" onchange="setPredictionValue('${id}', 'away', this.value)" ${locked ? 'disabled' : ''}>
            <span class="points">${pts} pts</span>
          </div>
          <div class="prediction-actions">
            <button type="button" class="save-prediction-btn" onclick="savePrediction('${id}')" ${locked ? 'disabled' : ''}>Salvar palpite</button>
          </div>
          ${lockMessage ? `<p class="muted">${lockMessage}</p>` : ''}
        </div>
      </div>`;
    }).join('') || '<p class="muted">Nenhum jogo encontrado.</p>';

  if ($('totalMeusPalpites')) $('totalMeusPalpites').textContent = String(meusPalpites);
}

window.setPredictionValue = (gameIdValue, side, value) => {
  if (!currentUser?.id) return;

  predictions[gameIdValue] ||= {};
  predictions[gameIdValue][currentUser.id] ||= {
    home: '',
    away: '',
    user: {
      id: currentUser.id,
      name: currentUser.name,
      login: currentUser.login
    }
  };
  predictions[gameIdValue][currentUser.id][side] = value;
  syncCurrentUserIntoRankingPredictions();
  renderRanking();
  renderMatches();
  renderSessionPanel();
};

window.savePrediction = async gameIdValue => {
  if (!currentUser?.id) return;
  const targetGameId = String(gameIdValue);
  const game = games.find((item, idx) => String(gameId(item, idx)) === targetGameId);
  if (!game) return;
  const pred = predictions[targetGameId]?.[currentUser.id];
  const messageEl = $('mensagemPalpite');

  if (isGameLocked(game)) {
    if (messageEl) messageEl.textContent = 'Esse jogo ja comecou ou terminou. Nao e mais possivel salvar palpite.';
    showToast('Palpite bloqueado: o jogo ja comecou ou terminou.', 'warning');
    return;
  }

  if (!pred) {
    if (messageEl) messageEl.textContent = 'Nao encontrei o palpite desse jogo para salvar.';
    return;
  }

  if (pred.home === '' || pred.away === '') {
    if (messageEl) messageEl.textContent = 'Preencha os dois lados do placar para salvar no banco.';
    return;
  }

  try {
    const response = await savePredictionToApi(game, targetGameId, pred);
    if (response?.success === false) {
      throw new Error(response?.error || response?.message || 'A API nao confirmou o salvamento do palpite.');
    }

    await loadPredictionsFromApi();
    try {
      await loadRankingPredictionsFromApi();
    } catch (error) {
      console.warn('Ranking ainda nao respondeu depois de salvar o palpite.', error);
    }
    renderAll();
    const successMessage = `Palpite registrado com sucesso para ${teamName(game, 'home')} x ${teamName(game, 'away')}.`;
    if (messageEl) messageEl.textContent = successMessage;
    showToast(`Palpite salvo: ${teamName(game, 'home')} ${pred.home} x ${pred.away} ${teamName(game, 'away')}.`);
    showSuccessPopup(successMessage);
  } catch (error) {
    if (isDuplicatePredictionError(error)) {
      if (messageEl) messageEl.textContent = 'Esse palpite ja foi lancado para este jogo.';
      showToast('Esse palpite ja foi lancado para este jogo.', 'warning');
      return;
    }

    if (messageEl) messageEl.textContent = `Nao foi possivel salvar no banco: ${String(error.message || error)}`;
    showToast(`Erro ao salvar palpite: ${String(error.message || error)}`, 'error');
  }
};

function renderRanking() {
  const rows = getRows();
  if ($('totalParticipantes')) $('totalParticipantes').textContent = String(rows.length);
  if ($('totalPalpites')) $('totalPalpites').textContent = String(rows.reduce((sum, row) => sum + row.palpites, 0));

  if ($('rankingLista')) {
    if (loadingRanking && !rows.length) {
      $('rankingLista').innerHTML = '<div class="podium-empty">Carregando ranking oficial...</div>';
      return;
    }

    $('rankingLista').innerHTML =
      rows.map((row, i) => `
        <article class="leaderboard-row ${i < 3 ? 'highlight' : ''}">
          <div class="leaderboard-rank">#${i + 1}</div>
          <div class="leaderboard-user">
            <strong>${userLabel(row.user)}</strong>
            <span>@${row.user.login} • ${row.palpites} palpites</span>
          </div>
          <div class="leaderboard-points">${row.pontos} pts</div>
        </article>
      `).join('') || '<div class="podium-empty">Ainda nao existem palpites registrados.</div>';
  }

  if ($('podioRanking')) {
    const medals = ['1', '2', '3'];
    const classes = ['first', 'second', 'third'];
    const topThree = rows.slice(0, 3);

    $('podioRanking').innerHTML =
      topThree.map((row, index) => `
        <article class="podium-card ${classes[index]}">
          <span class="medal">${medals[index]}</span>
          <strong>#${index + 1}</strong>
          <h3>${userLabel(row.user)}</h3>
          <p>${row.palpites} palpites enviados</p>
          <span class="points-large">${row.pontos} pts</span>
        </article>
      `).join('') || '<div class="podium-empty">Ainda nao existem palpites suficientes para montar o podio.</div>';
  }
}

function renderTeamsGallery() {
  if (!$('galeriaTimes')) return;
  const sortedTeams = [...teams].sort((a, b) => {
    const nameA = a?.name_en || a?.name || '';
    const nameB = b?.name_en || b?.name || '';
    return nameA.localeCompare(nameB);
  });

  $('galeriaTimes').innerHTML =
    sortedTeams.map(team => {
      const name = team.name_en || team.name || team.country || team.team_name || 'Time';
      const flag = teamFlag(team, name);
      return `<article class="team-flag-card">
        ${flag ? `<img src="${flag}" alt="Bandeira de ${name}" loading="lazy">` : '<div class="flag-placeholder">Sem bandeira</div>'}
        <span>${name}</span>
      </article>`;
    }).join('') || '<p class="muted">Times ainda nao carregados.</p>';
}

function renderAll() {
  renderHeroSession();
  renderSessionPanel();
  renderGroups();
  renderMatches();
  renderRanking();
  renderTeamsGallery();
}

if ($('formParticipante')) {
  $('formParticipante').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('nomeParticipante').value.trim();
    const login = $('loginParticipante').value.trim().toLowerCase();
    const password = $('senhaParticipante').value.trim();
    const validationMessage = validateRegisterInput(name, login, password);

    if (validationMessage) {
      if ($('mensagemCadastro')) $('mensagemCadastro').textContent = validationMessage;
      showToast(validationMessage, 'warning');
      return;
    }

    try {
      const user = await registerWithApi(name, login, password);
      setSession(user);
      if ($('mensagemCadastro')) $('mensagemCadastro').textContent = `Cadastro realizado para @${user.login}.`;
      await syncPredictionsAfterAuth('mensagemCadastro');
      $('nomeParticipante').value = '';
      $('loginParticipante').value = '';
      $('senhaParticipante').value = '';
      renderAll();
      showToast(`Cadastro realizado com sucesso para @${user.login}.`);
    } catch (error) {
      if ($('mensagemCadastro')) $('mensagemCadastro').textContent = String(error.message || error);
      showToast(String(error.message || error), 'error');
    }
  });
}

if ($('formLogin')) {
  $('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const login = $('loginAcesso').value.trim().toLowerCase();
    const password = $('senhaAcesso').value.trim();
    const validationMessage = validateLoginInput(login, password);

    if (validationMessage) {
      if ($('mensagemLogin')) $('mensagemLogin').textContent = validationMessage;
      showToast(validationMessage, 'warning');
      return;
    }

    try {
      const user = await loginWithApi(login, password);
      setSession(user);
      if ($('mensagemLogin')) $('mensagemLogin').textContent = `Login validado para @${user.login}.`;
      await syncPredictionsAfterAuth('mensagemLogin');
      $('loginAcesso').value = '';
      $('senhaAcesso').value = '';
      renderAll();
      showToast(`Login realizado para @${user.login}.`);
    } catch (error) {
      if ($('mensagemLogin')) $('mensagemLogin').textContent = String(error.message || error);
      showToast(String(error.message || error), 'error');
    }
  });
}

if ($('btnLogoutNav')) {
  $('btnLogoutNav').addEventListener('click', () => {
    setSession(null);
    if ($('mensagemLogin')) $('mensagemLogin').textContent = 'Sessao encerrada.';
    renderAll();
    showToast('Sessao encerrada.', 'warning');
  });
}

if ($('btnAtualizar')) $('btnAtualizar').addEventListener('click', () => loadData(true));
if ($('btnRecalcular')) $('btnRecalcular').addEventListener('click', renderRanking);
if ($('filtroGrupo')) $('filtroGrupo').addEventListener('change', renderMatches);

clearLegacyUserCache();
rebuildTeamIndex();
loadData().then(async () => {
  if (currentUser?.id) {
    try {
      await loadPredictionsFromApi();
    } catch (error) {
      console.warn('Nao foi possivel carregar os palpites do usuario logado.', error);
    }
  }

  try {
    await loadRankingPredictionsFromApi();
  } catch (error) {
    console.warn('Nao foi possivel carregar o ranking da API.', error);
  }

  renderAll();
});

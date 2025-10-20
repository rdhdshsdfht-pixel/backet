const tableBody = document.querySelector('#matches tbody');
const leagueSelect = document.querySelector('#league');
const searchInput = document.querySelector('#search');
const refreshBtn = document.querySelector('#refresh');
const dateInput = document.querySelector('#date');
const sortSelect = document.querySelector('#sort');
const matchesView = document.getElementById('matchesView');
const matchCenterView = document.getElementById('matchCenter');
const backToListBtn = document.getElementById('backToList');
const homeHistoryList = document.getElementById('homeHistoryList');
const awayHistoryList = document.getElementById('awayHistoryList');
const homeHistoryTitle = document.getElementById('homeHistoryTitle');
const awayHistoryTitle = document.getElementById('awayHistoryTitle');
const headToHeadBody = document.querySelector('#headToHead tbody');
const headToHeadSummary = document.getElementById('headToHeadSummary');
const matchCenterError = document.getElementById('matchCenterError');
const homeTeamName = document.getElementById('homeTeamName');
const awayTeamName = document.getElementById('awayTeamName');
const homeTeamMeta = document.getElementById('homeTeamMeta');
const awayTeamMeta = document.getElementById('awayTeamMeta');
const matchCenterDate = document.getElementById('matchCenterDate');
const matchCenterTournament = document.getElementById('matchCenterTournament');
const matchCenterStatus = document.getElementById('matchCenterStatus');
const matchCenterCountry = document.getElementById('matchCenterCountry');
const matchCenterScore = document.getElementById('matchCenterScore');

const API_ENDPOINT = API_BASE.trim();

let allMatches = [];
let currentMatch = null;
let matchCenterRequestId = 0;

function initDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

function formatDateForAPI(isoDate) {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

async function fetchMatches() {
  const dateFormatted = formatDateForAPI(dateInput.value);
  tableBody.innerHTML = '<tr><td colspan="7">Загрузка...</td></tr>';

  try {
    const res = await fetch(buildApiUrl({ date: dateFormatted }));
    const data = await res.json();

    // Если API вернул массив — используем его напрямую
    if (Array.isArray(data)) {
      allMatches = data;
    } else if (Array.isArray(data.events)) {
      allMatches = data.events;
    } else if (Array.isArray(data.matches)) {
      allMatches = data.matches;
    } else {
      allMatches = [];
    }

    allMatches = normalizeMatches(allMatches);

    fillLeagues();
    renderTable();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7">Ошибка: ${err.message}</td></tr>`;
  }
}

function buildApiUrl(params = {}) {
  try {
    const url = new URL(API_ENDPOINT);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  } catch (error) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });

    const separator = API_ENDPOINT.includes('?') ? '&' : '?';
    return `${API_ENDPOINT}${query.toString() ? separator + query.toString() : ''}`;
  }
}

function fillLeagues() {
  const leagues = [...new Set(allMatches.map(m => m.tournament?.name).filter(Boolean))].sort();
  leagueSelect.innerHTML = '<option value="">Все лиги</option>';
  leagues.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    leagueSelect.appendChild(opt);
  });
}

function renderTable() {
  showMatchListView();

  const leagueFilter = leagueSelect.value;
  const searchQuery = searchInput.value.toLowerCase();
  const liveOnly = liveOnlyCheckbox.checked;

  let filtered = allMatches;

  // Фильтр по лиге
  if (leagueFilter) {
    filtered = filtered.filter(m => m.tournament?.name === leagueFilter);
  }

  // Фильтр "только live"
  if (liveOnly) {
    filtered = filtered.filter(m =>
      m.status?.description?.toLowerCase().includes('live') ||
      m.status?.type?.toLowerCase().includes('inprogress')
    );
  }

  // Фильтр по поиску команды
  if (searchQuery) {
    filtered = filtered.filter(m =>
      m.homeTeam?.name?.toLowerCase().includes(searchQuery) ||
      m.awayTeam?.name?.toLowerCase().includes(searchQuery)
    );
  }

  // Очистка таблицы
  tableBody.innerHTML = '';

  if (filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7">Нет матчей</td></tr>';
    return;
  }

  const sorted = sortMatches(filtered);

  // Формируем строки таблицы
  sorted.forEach(match => {
    const row = document.createElement('tr');
    row.classList.add('clickable-row');
    row.tabIndex = 0;

    const date = new Date(match.startTimestamp * 1000).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow'
    });

    row.innerHTML = `
      <td>${match.countryName}</td>
      <td>${date}</td>
      <td>${match.tournament?.name || ''}</td>
      <td>${match.homeTeam?.name || ''}</td>
      <td>${match.homeScore?.current ?? '-'} : ${match.awayScore?.current ?? '-'}</td>
      <td>${match.awayTeam?.name || ''}</td>
      <td>${match.status?.description || ''}</td>
    `;

    row.addEventListener('click', () => openMatchCenter(match));
    row.addEventListener('keydown', evt => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        openMatchCenter(match);
      }
    });

    tableBody.appendChild(row);
  });
}

function normalizeMatches(matches) {
  return matches.map(match => ({
    ...match,
    countryName: resolveCountryName(match)
  }));
}

function resolveCountryName(match) {
  // В ответах BasketAPI страна может лежать в разных ветках.
  // Сначала проверяем наиболее точные поля (страна турнира, категория,
  // прямое поле country и страны команд). Как только находим непустое
  // значение, возвращаем его.
  const candidates = [
    match.tournament?.country?.name,
    match.tournament?.category?.name,
    match.country?.name,
    match.homeTeam?.country?.name,
    match.awayTeam?.country?.name
  ].filter(Boolean);

  if (candidates.length > 0) {
    return candidates[0];
  }

  const leagueName = match.tournament?.name;
  if (leagueName) {
    // Некоторые лиги шифруют страну в названии в скобках, например
    // "Liga A (Spain)". Вытаскиваем это значение регулярным выражением.
    const countryInBrackets = leagueName.match(/\(([^)]+)\)$/);
    if (countryInBrackets) {
      return countryInBrackets[1];
    }
  }

  return 'Неизвестно';
}

function sortMatches(matches) {
  const sorted = [...matches];
  const mode = sortSelect.value;

  if (mode === 'time') {
    sorted.sort((a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0));
    return sorted;
  }

  sorted.sort((a, b) => {
    const countryA = (a.countryName || '').toLowerCase();
    const countryB = (b.countryName || '').toLowerCase();
    const countryCompare = countryA.localeCompare(countryB, 'ru');

    if (countryCompare !== 0) {
      return countryCompare;
    }

    return (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0);
  });

  return sorted;
}

function showMatchListView() {
  matchesView?.classList.remove('hidden');
  matchCenterView?.classList.add('hidden');
}

function showMatchCenterView() {
  matchesView?.classList.add('hidden');
  matchCenterView?.classList.remove('hidden');
}

async function openMatchCenter(match) {
  currentMatch = match;
  const requestId = ++matchCenterRequestId;
  populateMatchHeader(match);
  resetMatchCenterState();
  showMatchCenterView();

  try {
    const details = await fetchMatchCenterData(match);
    if (requestId !== matchCenterRequestId) {
      return;
    }

    renderTeamHistory(homeHistoryList, details.homeRecent, match.homeTeam);
    renderTeamHistory(awayHistoryList, details.awayRecent, match.awayTeam);
    renderHeadToHead(details.headToHead, match.homeTeam, match.awayTeam);
  } catch (error) {
    if (requestId === matchCenterRequestId) {
      showMatchCenterError(error.message);
    }
  }
}

function populateMatchHeader(match) {
  homeTeamName.textContent = match.homeTeam?.name || 'Домашняя команда';
  awayTeamName.textContent = match.awayTeam?.name || 'Гостевая команда';
  homeTeamMeta.textContent = match.homeTeam?.country?.name || match.countryName || '';
  awayTeamMeta.textContent = match.awayTeam?.country?.name || match.countryName || '';
  setChipText(
    matchCenterDate,
    match.startTimestamp
      ? new Date(match.startTimestamp * 1000).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
      : ''
  );
  setChipText(matchCenterTournament, match.tournament?.name || '');
  setChipText(matchCenterStatus, match.status?.description || '');
  setChipText(matchCenterCountry, match.countryName ? `Страна: ${match.countryName}` : '');

  const homeScore = extractScoreValue(match.homeScore, 'home');
  const awayScore = extractScoreValue(match.awayScore, 'away');
  if (homeScore !== null && awayScore !== null) {
    matchCenterScore.textContent = `${homeScore} : ${awayScore}`;
    matchCenterScore.classList.remove('upcoming');
  } else {
    matchCenterScore.textContent = 'Матч ещё не начался';
    matchCenterScore.classList.add('upcoming');
  }

  homeHistoryTitle.textContent = match.homeTeam?.name
    ? `Последние матчи ${match.homeTeam.name}`
    : 'Последние матчи';
  awayHistoryTitle.textContent = match.awayTeam?.name
    ? `Последние матчи ${match.awayTeam.name}`
    : 'Последние матчи';
}

function setChipText(element, text) {
  if (!element) {
    return;
  }

  if (text) {
    element.textContent = text;
    element.classList.remove('hidden');
  } else {
    element.textContent = '';
    element.classList.add('hidden');
  }
}

function resetMatchCenterState() {
  homeHistoryList.innerHTML = '<li class="placeholder">Загрузка...</li>';
  awayHistoryList.innerHTML = '<li class="placeholder">Загрузка...</li>';
  headToHeadBody.innerHTML = '<tr><td colspan="4">Загрузка...</td></tr>';
  headToHeadSummary.innerHTML = '';
  matchCenterError.textContent = '';
}

function showMatchCenterError(message) {
  const text = message || 'Не удалось загрузить данные матча.';
  matchCenterError.textContent = `Ошибка: ${text}`;
  homeHistoryList.innerHTML = '<li class="placeholder">Нет данных</li>';
  awayHistoryList.innerHTML = '<li class="placeholder">Нет данных</li>';
  headToHeadBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
  headToHeadSummary.innerHTML = '';
}

async function fetchMatchCenterData(match) {
  const params = { mode: 'match-center' };
  const matchId = match.id ?? match.eventId ?? match.matchId ?? match._id;

  if (matchId) {
    params.matchId = matchId;
  }

  if (match.homeTeam?.id) {
    params.homeId = match.homeTeam.id;
  } else if (match.homeTeam?.name) {
    params.homeName = match.homeTeam.name;
  }

  if (match.awayTeam?.id) {
    params.awayId = match.awayTeam.id;
  } else if (match.awayTeam?.name) {
    params.awayName = match.awayTeam.name;
  }

  const response = await fetch(buildApiUrl(params));

  if (!response.ok) {
    throw new Error(`Статус ${response.status}`);
  }

  const payload = await response.json();
  return normalizeMatchCenterPayload(payload);
}

function normalizeMatchCenterPayload(payload) {
  const source = unwrapPayload(payload);

  const headToHead = pickArray(source, ['headToHead', 'h2h', 'faceToFace', 'matches']);
  const homeRecent = pickArray(source, ['homeRecent', 'homeLastMatches', 'homeMatches', 'home']);
  const awayRecent = pickArray(source, ['awayRecent', 'awayLastMatches', 'awayMatches', 'away']);

  return {
    headToHead,
    homeRecent,
    awayRecent
  };
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  if (Array.isArray(payload)) {
    return { headToHead: payload };
  }

  if (Array.isArray(payload.data)) {
    return { headToHead: payload.data };
  }

  if (payload.data && typeof payload.data === 'object') {
    return payload.data;
  }

  return payload;
}

function pickArray(object, keys) {
  if (!object) {
    return [];
  }

  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && Array.isArray(value.events)) {
      return value.events;
    }
    if (value && Array.isArray(value.data)) {
      return value.data;
    }
  }

  return [];
}

function renderTeamHistory(listElement, matches, referenceTeam) {
  if (!listElement) {
    return;
  }

  if (!matches || matches.length === 0) {
    listElement.innerHTML = '<li class="placeholder">Нет данных</li>';
    return;
  }

  listElement.innerHTML = '';

  const sortedMatches = [...matches].sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

  sortedMatches.forEach(match => {
    const listItem = document.createElement('li');
    const isHomeTeam = isSameTeam(match.homeTeam, referenceTeam);
    const opponent = isHomeTeam ? match.awayTeam?.name : match.homeTeam?.name;
    const { home: homeScore, away: awayScore } = extractScores(match);
    const outcome = determineOutcome(match, isHomeTeam);

    const opponentSpan = document.createElement('span');
    opponentSpan.className = 'history-opponent';
    opponentSpan.textContent = opponent || '—';

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.innerHTML = `
      <span>${formatScore(homeScore, awayScore)}</span>
      <span>${formatDate(match.startTimestamp)}</span>
    `;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'history-score';

    if (outcome === 'win') {
      scoreSpan.classList.add('win');
      scoreSpan.textContent = 'В';
      scoreSpan.title = 'Победа';
    } else if (outcome === 'loss') {
      scoreSpan.classList.add('loss');
      scoreSpan.textContent = 'П';
      scoreSpan.title = 'Поражение';
    } else if (outcome === 'draw') {
      scoreSpan.classList.add('draw');
      scoreSpan.textContent = 'Н';
      scoreSpan.title = 'Ничья';
    } else {
      scoreSpan.classList.add('draw');
      scoreSpan.textContent = '—';
      scoreSpan.title = 'Нет результата';
    }

    listItem.appendChild(opponentSpan);
    listItem.appendChild(meta);
    listItem.appendChild(scoreSpan);
    listElement.appendChild(listItem);
  });
}

function renderHeadToHead(matches, homeTeam, awayTeam) {
  if (!matches || matches.length === 0) {
    headToHeadBody.innerHTML = '<tr><td colspan="4">Нет очных встреч</td></tr>';
    headToHeadSummary.innerHTML = '';
    return;
  }

  headToHeadBody.innerHTML = '';

  const sortedMatches = [...matches].sort((a, b) => (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0));

  sortedMatches.forEach(match => {
    const row = document.createElement('tr');
    const { home: homeScore, away: awayScore } = extractScores(match);
    const winner = resolveWinner(match, homeTeam, awayTeam);

    row.innerHTML = `
      <td>${formatDate(match.startTimestamp)}</td>
      <td>${match.tournament?.name || ''}</td>
      <td>${formatScore(homeScore, awayScore)}</td>
      <td>${winner || '—'}</td>
    `;

    headToHeadBody.appendChild(row);
  });

  renderHeadToHeadSummary(sortedMatches, homeTeam, awayTeam);
}

function renderHeadToHeadSummary(matches, homeTeam, awayTeam) {
  const stats = computeHeadToHeadStats(matches, homeTeam, awayTeam);

  headToHeadSummary.innerHTML = `
    <div class="summary-card">
      <span class="summary-label">Всего матчей</span>
      <span class="summary-value">${stats.total}</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">С результатом</span>
      <span class="summary-value">${stats.evaluated}</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Победы ${homeTeam?.name || 'Хозяев'}</span>
      <span class="summary-value">${stats.homeWins} (${formatPercent(stats.homeWinPct)})</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Победы ${awayTeam?.name || 'Гостей'}</span>
      <span class="summary-value">${stats.awayWins} (${formatPercent(stats.awayWinPct)})</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Ничьи</span>
      <span class="summary-value">${stats.draws}</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Средний тотал</span>
      <span class="summary-value">${formatAverage(stats.avgTotal)}</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Средний счёт хозяев</span>
      <span class="summary-value">${formatAverage(stats.avgHome)}</span>
    </div>
    <div class="summary-card">
      <span class="summary-label">Средний счёт гостей</span>
      <span class="summary-value">${formatAverage(stats.avgAway)}</span>
    </div>
  `;
}

function formatPercent(value) {
  if (value === null) {
    return '—';
  }

  return `${value}%`;
}

function formatAverage(value) {
  if (value === null) {
    return '—';
  }

  if (typeof value === 'number') {
    const fixed = value.toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  }

  return value;
}

function computeHeadToHeadStats(matches, homeTeam, awayTeam) {
  const total = matches.length;
  let evaluated = 0;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalPoints = 0;
  let homePoints = 0;
  let awayPoints = 0;

  matches.forEach(match => {
    const { home: homeScore, away: awayScore } = extractScores(match);

    if (homeScore === null || awayScore === null) {
      return;
    }

    evaluated += 1;
    totalPoints += homeScore + awayScore;
    homePoints += homeScore;
    awayPoints += awayScore;

    const homeSideBelongsToHomeTeam = isSameTeam(match.homeTeam, homeTeam);
    const homeSideBelongsToAwayTeam = isSameTeam(match.homeTeam, awayTeam);

    if (homeScore > awayScore) {
      if (homeSideBelongsToHomeTeam) {
        homeWins += 1;
      } else if (homeSideBelongsToAwayTeam) {
        awayWins += 1;
      }
    } else if (awayScore > homeScore) {
      if (homeSideBelongsToHomeTeam) {
        awayWins += 1;
      } else if (homeSideBelongsToAwayTeam) {
        homeWins += 1;
      }
    } else {
      draws += 1;
    }
  });

  const avgTotal = evaluated ? Number((totalPoints / evaluated).toFixed(1)) : null;
  const avgHome = evaluated ? Number((homePoints / evaluated).toFixed(1)) : null;
  const avgAway = evaluated ? Number((awayPoints / evaluated).toFixed(1)) : null;
  const homeWinPct = evaluated ? Math.round((homeWins / evaluated) * 100) : null;
  const awayWinPct = evaluated ? Math.round((awayWins / evaluated) * 100) : null;

  return {
    total,
    evaluated,
    homeWins,
    awayWins,
    draws,
    avgTotal,
    avgHome,
    avgAway,
    homeWinPct,
    awayWinPct
  };
}

function extractScores(match) {
  return {
    home: extractScoreValue(match.homeScore, 'home'),
    away: extractScoreValue(match.awayScore, 'away')
  };
}

function extractScoreValue(score, side) {
  if (!score) {
    return null;
  }

  if (typeof score === 'number') {
    return score;
  }

  if (typeof score.final === 'number') {
    return score.final;
  }

  if (typeof score.current === 'number') {
    return score.current;
  }

  if (typeof score.display === 'string') {
    const normalized = score.display.replace(/[^0-9:\-]/g, '').trim();

    if (!normalized) {
      return null;
    }

    const delimiter = normalized.includes(':') ? ':' : normalized.includes('-') ? '-' : null;

    if (delimiter) {
      const [first, second] = normalized.split(delimiter).map(part => Number(part.trim()));
      if (side === 'away') {
        return Number.isFinite(second) ? second : null;
      }
      return Number.isFinite(first) ? first : null;
    }

    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function determineOutcome(match, isHomeTeam) {
  if (typeof isHomeTeam !== 'boolean') {
    return null;
  }

  const { home: homeScore, away: awayScore } = extractScores(match);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore === awayScore) {
    return 'draw';
  }

  const teamWon = isHomeTeam ? homeScore > awayScore : awayScore > homeScore;
  return teamWon ? 'win' : 'loss';
}

function resolveWinner(match, homeTeam, awayTeam) {
  const { home: homeScore, away: awayScore } = extractScores(match);

  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore === awayScore) {
    return 'Ничья';
  }

  const winnerTeam = homeScore > awayScore ? match.homeTeam : match.awayTeam;

  if (isSameTeam(winnerTeam, homeTeam)) {
    return homeTeam?.name || match.homeTeam?.name || 'Хозяева';
  }

  if (isSameTeam(winnerTeam, awayTeam)) {
    return awayTeam?.name || match.awayTeam?.name || 'Гости';
  }

  return winnerTeam?.name || '—';
}

function isSameTeam(candidate, reference) {
  if (!candidate || !reference) {
    return false;
  }

  if (candidate.id && reference.id) {
    return String(candidate.id) === String(reference.id);
  }

  if (candidate.teamId && reference.teamId) {
    return String(candidate.teamId) === String(reference.teamId);
  }

  if (candidate.slug && reference.slug) {
    return candidate.slug === reference.slug;
  }

  if (candidate.name && reference.name) {
    return candidate.name.toLowerCase() === reference.name.toLowerCase();
  }

  return false;
}

function formatScore(home, away) {
  if (home === null || away === null) {
    return '—';
  }

  return `${home} : ${away}`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}

backToListBtn?.addEventListener('click', () => {
  matchCenterRequestId += 1;
  showMatchListView();
  currentMatch = null;
});

const liveOnlyCheckbox = document.getElementById('liveOnly');

liveOnlyCheckbox.addEventListener('change', renderTable);
searchInput.addEventListener('input', renderTable);
leagueSelect.addEventListener('change', renderTable);
sortSelect.addEventListener('change', renderTable);

refreshBtn.addEventListener('click', fetchMatches);
dateInput.addEventListener('change', fetchMatches);

initDate();
fetchMatches();
// Обновление сортировки матчей

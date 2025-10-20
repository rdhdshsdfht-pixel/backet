const tableBody = document.querySelector('#matches tbody');
const leagueSelect = document.querySelector('#league');
const searchInput = document.querySelector('#search');
const refreshBtn = document.querySelector('#refresh');
const dateInput = document.querySelector('#date');
const sortSelect = document.querySelector('#sort');

let allMatches = [];

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
    const res = await fetch(`${API_BASE}?date=${dateFormatted}`);
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

const tableBody = document.querySelector('#matches tbody');
const leagueSelect = document.querySelector('#league');
const searchInput = document.querySelector('#search');
const refreshBtn = document.querySelector('#refresh');
const dateInput = document.querySelector('#date');

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
  tableBody.innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';

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

    fillLeagues();
    renderTable();
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6">Ошибка: ${err.message}</td></tr>`;
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
  const tableBody = document.querySelector('#matches tbody');
  const leagueFilter = document.getElementById('league').value;
  const searchQuery = document.getElementById('search').value.toLowerCase();
  const liveOnly = document.getElementById('liveOnly').checked;

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
    tableBody.innerHTML = '<tr><td colspan="6">Нет матчей</td></tr>';
    return;
  }

  // Формируем строки таблицы
  filtered.forEach(match => {
    const row = document.createElement('tr');

    const date = new Date(match.startTimestamp * 1000).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow'
    });

    row.innerHTML = `
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

document.getElementById('liveOnly').addEventListener('change', renderTable);
document.getElementById('search').addEventListener('input', renderTable);
document.getElementById('league').addEventListener('change', renderTable);

refreshBtn.addEventListener('click', fetchMatches);
leagueSelect.addEventListener('change', renderTable);
searchInput.addEventListener('input', renderTable);
dateInput.addEventListener('change', fetchMatches);

initDate();
fetchMatches();
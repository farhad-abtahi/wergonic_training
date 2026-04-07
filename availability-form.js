const APRIL_MONTH_INDEX = 3;
const SLOT_MINUTES = 30;
const START_MINUTES = 8 * 60;
const END_MINUTES = 20 * 60;

const today = new Date();
const APRIL_YEAR = today.getFullYear();

const selectedCells = new Set();
const weekStarts = buildAprilWeekStarts(APRIL_YEAR);
let currentWeekIndex = getInitialWeekIndex();
let isDragging = false;
let dragMode = 'paint';

const weekGrid = document.getElementById('weekGrid');
const weekLabel = document.getElementById('weekLabel');
const weekSelect = document.getElementById('weekSelect');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const slotList = document.getElementById('slotList');
const selectionSummary = document.getElementById('selectionSummary');
const statusMsg = document.getElementById('statusMsg');
const form = document.getElementById('availabilityForm');

initWeekSelector();
renderWeek();
updateSelectionSummary();

prevWeekBtn.addEventListener('click', () => {
  if (currentWeekIndex > 0) {
    currentWeekIndex -= 1;
    renderWeek();
  }
});

nextWeekBtn.addEventListener('click', () => {
  if (currentWeekIndex < weekStarts.length - 1) {
    currentWeekIndex += 1;
    renderWeek();
  }
});

weekSelect.addEventListener('change', () => {
  currentWeekIndex = Number(weekSelect.value);
  renderWeek();
});

weekGrid.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.slot-cell');
  if (!cell || cell.disabled) return;

  isDragging = true;
  dragMode = cell.classList.contains('selected') ? 'erase' : 'paint';
  applyDragAction(cell);
  event.preventDefault();
});

weekGrid.addEventListener('pointerover', (event) => {
  if (!isDragging) return;
  const cell = event.target.closest('.slot-cell');
  if (!cell || cell.disabled) return;
  applyDragAction(cell);
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

function renderSlots() {
  const slots = getMergedSlots();
  slotList.innerHTML = '';
  slots.forEach((slot, index) => {
    const li = document.createElement('li');
    li.className = 'slot-item';

    const text = document.createElement('span');
    text.textContent = `${slot.date} ${slot.start} - ${slot.end}`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      removeMergedSlot(slots[index]);
      renderWeek();
      updateSelectionSummary();
      renderSlots();
    });

    li.appendChild(text);
    li.appendChild(removeBtn);
    slotList.appendChild(li);
  });
}

function setStatus(message, isError = false) {
  statusMsg.textContent = message;
  statusMsg.classList.toggle('error', isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const participantName = document.getElementById('participantName').value.trim();
  const participantEmail = document.getElementById('participantEmail').value.trim();
  const note = document.getElementById('participantNote').value.trim();

  if (!participantName || !participantEmail) {
    setStatus('Please enter your name and email.', true);
    return;
  }

  const slots = getMergedSlots();
  if (slots.length === 0) {
    setStatus('Please add at least one available time slot.', true);
    return;
  }

  setStatus('Submitting, please wait...');

  try {
    const resp = await fetch('/api/participant-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantName,
        participantEmail,
        note,
        slots
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Submission failed');
    }

    setStatus('Submitted successfully. Email has been sent.');
    form.reset();
    selectedCells.clear();
    renderWeek();
    updateSelectionSummary();
    renderSlots();
  } catch (err) {
    setStatus(`Submission failed: ${err.message}`, true);
  }
});

function initWeekSelector() {
  weekStarts.forEach((start, index) => {
    const end = addDays(start, 6);
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `Week ${index + 1}: ${formatShortDate(start)} - ${formatShortDate(end)}`;
    weekSelect.appendChild(option);
  });
}

function renderWeek() {
  weekGrid.innerHTML = '';
  weekSelect.value = String(currentWeekIndex);

  const weekStart = weekStarts[currentWeekIndex];
  const weekEnd = addDays(weekStart, 6);
  weekLabel.textContent = `April ${APRIL_YEAR} | ${formatLongDate(weekStart)} - ${formatLongDate(weekEnd)}`;

  const corner = document.createElement('div');
  corner.className = 'corner-cell';
  corner.textContent = 'Time';
  weekGrid.appendChild(corner);

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = addDays(weekStart, dayOffset);
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = formatDayHeader(date);
    weekGrid.appendChild(header);
  }

  getTimeStarts().forEach((time) => {
    const timeCell = document.createElement('div');
    timeCell.className = 'time-cell';
    timeCell.textContent = time;
    weekGrid.appendChild(timeCell);

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = addDays(weekStart, dayOffset);
      const inApril = date.getFullYear() === APRIL_YEAR && date.getMonth() === APRIL_MONTH_INDEX;
      const key = `${formatDateKey(date)}|${time}`;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'slot-cell';
      cell.dataset.key = key;
      cell.setAttribute('aria-label', `${formatDateKey(date)} ${time}`);

      if (!inApril) {
        cell.disabled = true;
        cell.classList.add('outside-month');
      }

      if (selectedCells.has(key)) {
        cell.classList.add('selected');
      }

      weekGrid.appendChild(cell);
    }
  });
}

function applyDragAction(cell) {
  const key = cell.dataset.key;
  if (!key) return;

  if (dragMode === 'paint') {
    if (selectedCells.has(key)) return;
    selectedCells.add(key);
    cell.classList.add('selected');
  } else {
    if (!selectedCells.has(key)) return;
    selectedCells.delete(key);
    cell.classList.remove('selected');
  }

  updateSelectionSummary();
  renderSlots();
}

function updateSelectionSummary() {
  const count = selectedCells.size;
  const totalHours = (count * SLOT_MINUTES) / 60;
  selectionSummary.textContent = `Selected blocks: ${count} (${totalHours} hour(s))`;
}

function getMergedSlots() {
  const grouped = new Map();

  selectedCells.forEach((key) => {
    const [date, start] = key.split('|');
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(timeToMinutes(start));
  });

  const merged = [];
  grouped.forEach((minutesList, date) => {
    minutesList.sort((a, b) => a - b);

    let rangeStart = minutesList[0];
    let previous = minutesList[0];

    for (let i = 1; i < minutesList.length; i += 1) {
      const current = minutesList[i];
      if (current !== previous + SLOT_MINUTES) {
        merged.push({
          date,
          start: minutesToTime(rangeStart),
          end: minutesToTime(previous + SLOT_MINUTES)
        });
        rangeStart = current;
      }
      previous = current;
    }

    merged.push({
      date,
      start: minutesToTime(rangeStart),
      end: minutesToTime(previous + SLOT_MINUTES)
    });
  });

  merged.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.start.localeCompare(b.start);
  });

  return merged;
}

function removeMergedSlot(slot) {
  const start = timeToMinutes(slot.start);
  const end = timeToMinutes(slot.end);
  for (let minutes = start; minutes < end; minutes += SLOT_MINUTES) {
    const key = `${slot.date}|${minutesToTime(minutes)}`;
    selectedCells.delete(key);
  }
}

function getTimeStarts() {
  const times = [];
  for (let minutes = START_MINUTES; minutes < END_MINUTES; minutes += SLOT_MINUTES) {
    times.push(minutesToTime(minutes));
  }
  return times;
}

function buildAprilWeekStarts(year) {
  const aprilStart = new Date(year, APRIL_MONTH_INDEX, 1);
  const aprilEnd = new Date(year, APRIL_MONTH_INDEX, 30);
  const starts = [];
  const cursor = startOfWeek(aprilStart);
  const lastWeekStart = startOfWeek(aprilEnd);

  while (cursor <= lastWeekStart) {
    starts.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  return starts;
}

function getInitialWeekIndex() {
  if (today.getMonth() !== APRIL_MONTH_INDEX || today.getFullYear() !== APRIL_YEAR) {
    return 0;
  }

  const monday = startOfWeek(today);
  const key = formatDateKey(monday);
  const index = weekStarts.findIndex((start) => formatDateKey(start) === key);
  return index === -1 ? 0 : index;
}

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatLongDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDayHeader(date) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayIndex = (date.getDay() + 6) % 7;
  return `${weekdays[weekdayIndex]} ${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minute = String(totalMinutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

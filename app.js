// Инициализация Telegram Web App SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Ключ для хранения в localStorage
const STORAGE_KEY = 'tg_habits';

// Начальные примеры привычек (если хранилище пустое)
const DEFAULT_HABITS = [
  { id: '1', text: 'Выпить 2 стакана воды утром', completed: true },
  { id: '2', text: 'Утренняя зарядка 15 мин', completed: false },
  { id: '3', text: 'Прочитать 10 страниц книги', completed: false }
];

// Загрузка привычек из localStorage
let habits = loadHabits();

function loadHabits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HABITS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_HABITS;
  } catch (e) {
    console.error('Ошибка загрузки привычек из localStorage:', e);
    return DEFAULT_HABITS;
  }
}

// Сохранение привычек в localStorage
function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    console.error('Ошибка сохранения привычек в localStorage:', e);
  }
}

// Экранирование HTML для защиты от XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Тактильный отклик через Telegram WebApp
function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
}

// Обновление счетчика "Выполнено: X из Y"
function updateProgress() {
  const el = document.getElementById('progress-text');
  if (!el) return;

  const total = Array.isArray(habits) ? habits.length : 0;
  const completedCount = Array.isArray(habits)
    ? habits.filter((h) => Boolean(h.completed)).length
    : 0;

  el.textContent = `Выполнено: ${completedCount} из ${total}`;
}

// Управление темой оформления
function getInitialTheme() {
  if (tg?.colorScheme) {
    return tg.colorScheme === 'dark';
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let isDark = getInitialTheme();

function applyTheme(dark) {
  isDark = dark;
  document.body.classList.remove('tg-dark', 'tg-light');
  document.body.classList.add(isDark ? 'tg-dark' : 'tg-light');

  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');
  if (themeIcon) themeIcon.textContent = isDark ? '🌙' : '☀️';
  if (themeLabel) themeLabel.textContent = isDark ? 'Тёмная' : 'Светлая';
}

// Отрисовка списка привычек в DOM
function renderHabits() {
  const habitList = document.getElementById('habit-list');
  const emptyState = document.getElementById('empty-state');
  if (!habitList) return;

  habitList.innerHTML = '';

  if (habits.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';

    habits.forEach((habit) => {
      const li = document.createElement('li');
      li.className = `habit-item ${habit.completed ? 'completed' : ''}`;
      li.dataset.id = habit.id;

      li.innerHTML = `
        <div class="habit-content">
          <div class="habit-checkbox" aria-label="Отметить привычку">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span class="habit-text">${escapeHtml(habit.text)}</span>
        </div>
        <button class="delete-btn" type="button" aria-label="Удалить привычку" title="Удалить">&times;</button>
      `;

      // Переключение статуса выполнения привычки
      const content = li.querySelector('.habit-content');
      content.addEventListener('click', () => {
        toggleHabit(habit.id);
      });

      // Удаление привычки
      const deleteBtn = li.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHabit(habit.id);
      });

      habitList.appendChild(li);
    });
  }

  // Обновляем счетчик
  updateProgress();
}

// Добавление новой привычки
function addHabit(text) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const newHabit = {
    id: Date.now().toString(),
    text: trimmedText,
    completed: false
  };

  habits.unshift(newHabit);
  saveHabits();
  renderHabits();
  updateProgress();
  triggerHaptic('success');
}

// Переключение выполнения привычки (зачеркивание)
function toggleHabit(id) {
  habits = habits.map((habit) => {
    if (habit.id === id) {
      return { ...habit, completed: !habit.completed };
    }
    return habit;
  });

  saveHabits();
  renderHabits();
  updateProgress();
  triggerHaptic('light');
}

// Удаление привычки
function deleteHabit(id) {
  habits = habits.filter((habit) => habit.id !== id);
  saveHabits();
  renderHabits();
  updateProgress();
  triggerHaptic('medium');
}

// Инициализация событий при загрузке документа
function init() {
  applyTheme(isDark);

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      applyTheme(!isDark);
      triggerHaptic('light');
    });
  }

  if (tg?.onEvent) {
    tg.onEvent('themeChanged', () => {
      if (tg.colorScheme) {
        applyTheme(tg.colorScheme === 'dark');
      }
    });
  }

  const habitForm = document.getElementById('habit-form');
  const habitInput = document.getElementById('habit-input');
  if (habitForm && habitInput) {
    habitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addHabit(habitInput.value);
      habitInput.value = '';
      habitInput.focus();
    });
  }

  renderHabits();
  updateProgress();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

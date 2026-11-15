// Инициализация Telegram Web App SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Ключи для localStorage
const HABITS_STORAGE_KEY = 'tg_habits';
const THEME_STORAGE_KEY = 'tg_app_theme';

// Начальные привычки по умолчанию (если список пуст)
const DEFAULT_HABITS = [
  { id: '1', text: 'Выпить 2 стакана воды утром', completed: true },
  { id: '2', text: 'Утренняя зарядка 15 мин', completed: false },
  { id: '3', text: 'Прочитать 10 страниц книги', completed: false }
];

// Загрузка привычек
let habits = loadHabits();

function loadHabits() {
  try {
    const raw = localStorage.getItem(HABITS_STORAGE_KEY);
    if (!raw) return DEFAULT_HABITS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_HABITS;
  } catch (e) {
    console.error('Ошибка загрузки привычек из localStorage:', e);
    return DEFAULT_HABITS;
  }
}

// Сохранение привычек
function saveHabits() {
  try {
    localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    console.error('Ошибка сохранения привычек в localStorage:', e);
  }
}

// Экранирование HTML от XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Тактильный отклик Telegram WebApp
function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
}

// ============================================================
// УПРАВЛЕНИЕ ТЕМОЙ ОФОРМЛЕНИЯ С СОХРАНЕНИЕМ В LOCALSTORAGE
// ============================================================

// Определение темы при запуске: localStorage -> Telegram -> Системная
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch (e) {}

  if (tg?.colorScheme) {
    return tg.colorScheme === 'dark' ? 'dark' : 'light';
  }

  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

// Применение темы (добавляет/удаляет dark-theme и light-theme на body)
function applyTheme(themeName, save = false) {
  const isDark = themeName === 'dark';
  document.body.classList.remove('dark-theme', 'light-theme');
  document.body.classList.add(isDark ? 'dark-theme' : 'light-theme');

  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');
  if (themeIcon) themeIcon.textContent = isDark ? '🌙' : '☀️';
  if (themeLabel) themeLabel.textContent = isDark ? 'Тёмная' : 'Светлая';

  if (save) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch (e) {
      console.error('Ошибка сохранения темы в localStorage:', e);
    }
  }
}

// Переключение темы пользователем
function toggleTheme() {
  const currentIsDark = document.body.classList.contains('dark-theme');
  const nextTheme = currentIsDark ? 'light' : 'dark';
  applyTheme(nextTheme, true);
  triggerHaptic('light');
}

// ============================================================
// СЧЕТЧИК И СПИСОК ПРИВЫЧЕК
// ============================================================

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

// Отрисовка списка привычек
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

      // Переключение выполнения привычки
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

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function init() {
  // Устанавливаем тему
  applyTheme(getInitialTheme(), false);

  // Кнопка переключения темы
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  }

  // Реакция на смену темы в Telegram (только если пользователь не сохранил свой выбор)
  if (tg?.onEvent) {
    tg.onEvent('themeChanged', () => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved && tg.colorScheme) {
        applyTheme(tg.colorScheme === 'dark' ? 'dark' : 'light', false);
      }
    });
  }

  // Обработка формы добавления
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

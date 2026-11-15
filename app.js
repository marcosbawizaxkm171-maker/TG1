// Инициализация Telegram Web App SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Конфигурация Supabase
const SUPABASE_URL = 'https://bxihlyvxjbogrknhictr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yzIVR0rDqR7P7woXxMoVMQ_U2luuo-k';

// Инициализация клиента Supabase через CDN-библиотеку
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Определение ID текущего пользователя (Telegram user.id или тестовый ID для локальной проверки)
function getUserId() {
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgUserId || 123456789;
}
const currentUserId = getUserId();

// Ключ для хранения темы оформления в localStorage
const THEME_STORAGE_KEY = 'tg_app_theme';

// Локальное состояние списка привычек текущего пользователя
let habits = [];

// Экранирование HTML для защиты от XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Нативная вибрация Telegram (Haptic Feedback)
function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else if (type === 'medium') {
      tg.HapticFeedback.impactOccurred('medium');
    } else {
      tg.HapticFeedback.impactOccurred('light');
    }
  }
}

// Праздничный салют конфетти при 100% выполнении привычек
function launchConfetti() {
  if (typeof confetti === 'function') {
    // Основной залп конфетти по центру
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Боковые салюты через 200 мс для вау-эффекта
    setTimeout(() => {
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 }
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 }
      });
    }, 200);
  }
}

// ============================================================
// УПРАВЛЕНИЕ ТЕМОЙ ОФОРМЛЕНИЯ (СОХРАНЯЕТСЯ В LOCALSTORAGE)
// ============================================================

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

function toggleTheme() {
  const currentIsDark = document.body.classList.contains('dark-theme');
  const nextTheme = currentIsDark ? 'light' : 'dark';
  applyTheme(nextTheme, true);
  triggerHaptic('light');
}

// ============================================================
// СЧЕТЧИК И ОТОБРАЖЕНИЕ ПРИВЫЧЕК
// ============================================================

// Обновление счетчика "Выполнено: X из Y"
function updateProgress() {
  const el = document.getElementById('progress-text');
  if (!el) return;

  const total = Array.isArray(habits) ? habits.length : 0;
  const completedCount = Array.isArray(habits)
    ? habits.filter((h) => Boolean(h.is_done)).length
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
      li.className = `habit-item ${habit.is_done ? 'completed' : ''}`;
      li.dataset.id = habit.id;

      li.innerHTML = `
        <div class="habit-content">
          <div class="habit-checkbox" aria-label="Отметить привычку">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span class="habit-text">${escapeHtml(habit.title)}</span>
        </div>
        <button class="delete-btn" type="button" aria-label="Удалить привычку" title="Удалить">&times;</button>
      `;

      // Клик по чекбоксу/тексту: переключение выполнения привычки
      const content = li.querySelector('.habit-content');
      content.addEventListener('click', () => {
        toggleHabit(habit.id);
      });

      // Клик по крестику: удаление привычки
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

// ============================================================
// АСИНХРОННЫЕ ОПЕРАЦИИ С ОБЛАЧНОЙ БАЗОЙ ДАННЫХ SUPABASE
// ============================================================

// 1. Загрузка привычек текущего пользователя (сортировка по id по возрастанию)
async function fetchHabits() {
  if (!supabaseClient) {
    console.error('Клиент Supabase не инициализирован. Проверьте подключение скрипта через CDN.');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('habits')
      .select('*')
      .eq('user_id', currentUserId)
      .order('id', { ascending: true });

    if (error) {
      console.error('Ошибка загрузки привычек из Supabase:', error);
      return;
    }

    habits = data || [];
    renderHabits();
  } catch (err) {
    console.error('Сетевая ошибка при загрузке привычек:', err);
  }
}

// 2. Добавление новой привычки в Supabase
async function addHabit(title) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || !supabaseClient) return;

  const addBtn = document.getElementById('add-btn');
  const habitInput = document.getElementById('habit-input');

  if (addBtn) addBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from('habits')
      .insert([
        {
          user_id: currentUserId,
          title: trimmedTitle,
          is_done: false
        }
      ])
      .select();

    if (error) {
      console.error('Ошибка добавления привычки в Supabase:', error);
      return;
    }

    if (data && data.length > 0) {
      habits.push(data[0]);
    } else {
      await fetchHabits();
      return;
    }

    if (habitInput) habitInput.value = '';
    renderHabits();
    triggerHaptic('light');
  } catch (err) {
    console.error('Сетевая ошибка при добавлении привычки:', err);
  } finally {
    if (addBtn) addBtn.disabled = false;
    if (habitInput) habitInput.focus();
  }
}

// 3. Переключение выполнения привычки (is_done) по id
async function toggleHabit(id) {
  if (!supabaseClient) return;

  const habit = habits.find((h) => h.id === id);
  if (!habit) return;

  const previousStatus = habit.is_done;
  const newStatus = !previousStatus;

  // Оптимистичное обновление интерфейса
  habit.is_done = newStatus;
  renderHabits();

  // Проверяем, выполнено ли 100% привычек
  const total = habits.length;
  const completedCount = habits.filter((h) => Boolean(h.is_done)).length;
  const isAllDone = total > 0 && completedCount === total;

  if (newStatus && isAllDone) {
    // Победный отклик и праздничный салют конфетти при 100% выполнении
    triggerHaptic('success');
    launchConfetti();
  } else {
    // Обычная легкая вибрация при отметке
    triggerHaptic('light');
  }

  try {
    const { error } = await supabaseClient
      .from('habits')
      .update({ is_done: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Ошибка обновления привычки в Supabase:', error);
      // Откатываем изменение при ошибке
      habit.is_done = previousStatus;
      renderHabits();
    }
  } catch (err) {
    console.error('Сетевая ошибка при обновлении привычки:', err);
    habit.is_done = previousStatus;
    renderHabits();
  }
}

// 4. Удаление привычки по id
async function deleteHabit(id) {
  if (!supabaseClient) return;

  const previousHabits = [...habits];
  habits = habits.filter((h) => h.id !== id);
  renderHabits();
  triggerHaptic('medium');

  try {
    const { error } = await supabaseClient
      .from('habits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Ошибка удаления привычки из Supabase:', error);
      // Восстанавливаем список при ошибке
      habits = previousHabits;
      renderHabits();
    }
  } catch (err) {
    console.error('Сетевая ошибка при удалении привычки:', err);
    habits = previousHabits;
    renderHabits();
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================

function init() {
  // Применение темы
  applyTheme(getInitialTheme(), false);

  // Кнопка переключения темы
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  }

  // Реакция на изменение темы Telegram
  if (tg?.onEvent) {
    tg.onEvent('themeChanged', () => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved && tg.colorScheme) {
        applyTheme(tg.colorScheme === 'dark' ? 'dark' : 'light', false);
      }
    });
  }

  // Обработка отправки формы
  const habitForm = document.getElementById('habit-form');
  const habitInput = document.getElementById('habit-input');
  if (habitForm && habitInput) {
    habitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addHabit(habitInput.value);
    });
  }

  // Загружаем данные пользователя из облака Supabase
  fetchHabits();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

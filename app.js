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

// Ключи для localStorage
const THEME_STORAGE_KEY = 'tg_app_theme';
const LAST_RESET_DATE_KEY = 'tg_last_reset_date';

// Локальное состояние приложения
let habits = [];
let currentUserStats = {
  user_id: currentUserId,
  streak: 0,
  last_completed_date: null
};

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДАТЫ (С УЧЕТОМ ЧАСОВОГО ПОЯСА)
// ============================================================

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

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
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

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
// ОТОБРАЖЕНИЕ СТАТИСТИКИ И СПИСКА ПРИВЫЧЕК
// ============================================================

// Обновление бейджа серии дней (Streak)
function updateStreakUI() {
  const streakCount = document.getElementById('streak-count');
  const streakBadge = document.getElementById('streak-badge');
  const streak = currentUserStats.streak || 0;

  if (streakCount) {
    streakCount.textContent = `${streak} дн.`;
  }
  if (streakBadge) {
    streakBadge.classList.toggle('active', streak > 0);
  }
}

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
// АСИНХРОННЫЕ ОПЕРАЦИИ С SUPABASE (HABITS И USER_STATS)
// ============================================================

// Загрузка статистики пользователя и проверка нового дня
async function fetchUserStats() {
  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from('user_stats')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (error) {
      console.error('Ошибка загрузки user_stats из Supabase:', error);
      return;
    }

    if (data) {
      currentUserStats = data;
    } else {
      currentUserStats = {
        user_id: currentUserId,
        streak: 0,
        last_completed_date: null
      };

      const { data: created, error: createError } = await supabaseClient
        .from('user_stats')
        .upsert(currentUserStats)
        .select()
        .single();

      if (!createError && created) {
        currentUserStats = created;
      }
    }

    // Проверяем наступление нового дня и пропуск серии
    await checkDailyReset();
    updateStreakUI();
  } catch (err) {
    console.error('Ошибка в fetchUserStats:', err);
  }
}

// Проверка нового дня и сброс привычек / серии дней
async function checkDailyReset() {
  const today = getLocalDateString();
  const yesterday = getYesterdayDateString();
  const lastDate = currentUserStats.last_completed_date;

  let needsStatsUpdate = false;

  // Если last_completed_date не равен ни сегодня, ни вчера (и не null) — пропуск дня, сбрасываем серию
  if (lastDate && lastDate !== today && lastDate !== yesterday) {
    if (currentUserStats.streak !== 0) {
      currentUserStats.streak = 0;
      needsStatsUpdate = true;
    }
  }

  // Если last_completed_date не равен сегодняшней дате — наступил новый день
  // Сбрасываем у всех привычек статус is_done = false
  const lastResetDate = localStorage.getItem(LAST_RESET_DATE_KEY);
  if (lastDate !== today && lastResetDate !== today) {
    try {
      await supabaseClient
        .from('habits')
        .update({ is_done: false })
        .eq('user_id', currentUserId);

      localStorage.setItem(LAST_RESET_DATE_KEY, today);
    } catch (err) {
      console.error('Ошибка сброса привычек на новый день:', err);
    }
  }

  if (needsStatsUpdate) {
    try {
      await supabaseClient
        .from('user_stats')
        .upsert({
          user_id: currentUserId,
          streak: currentUserStats.streak,
          last_completed_date: currentUserStats.last_completed_date
        });
    } catch (err) {
      console.error('Ошибка обновления streak при пропуске дня:', err);
    }
  }
}

// Загрузка привычек текущего пользователя
async function fetchHabits() {
  if (!supabaseClient) return;

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

// Добавление новой привычки
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

// Переключение выполнения привычки (is_done) и рост огонька (Streak)
async function toggleHabit(id) {
  if (!supabaseClient) return;

  const habit = habits.find((h) => h.id === id);
  if (!habit) return;

  const previousStatus = habit.is_done;
  const newStatus = !previousStatus;

  // Оптимистичное обновление интерфейса
  habit.is_done = newStatus;
  renderHabits();

  // Проверяем 100% выполнение всех привычек
  const total = habits.length;
  const completedCount = habits.filter((h) => Boolean(h.is_done)).length;
  const isAllDone = total > 0 && completedCount === total;

  if (newStatus && isAllDone) {
    const today = getLocalDateString();

    // Проверяем, не засчитана ли уже серия сегодня
    if (currentUserStats.last_completed_date !== today) {
      currentUserStats.streak = (currentUserStats.streak || 0) + 1;
      currentUserStats.last_completed_date = today;
      updateStreakUI();
      triggerHaptic('success');
      launchConfetti();

      // Сохраняем новую серию и дату в user_stats
      try {
        await supabaseClient
          .from('user_stats')
          .upsert({
            user_id: currentUserId,
            streak: currentUserStats.streak,
            last_completed_date: currentUserStats.last_completed_date
          });
      } catch (err) {
        console.error('Ошибка сохранения streak в Supabase:', err);
      }
    } else {
      // Уже засчитано сегодня: победный отклик и салют
      triggerHaptic('success');
      launchConfetti();
    }
  } else {
    // Обычная легкая вибрация
    triggerHaptic('light');
  }

  try {
    const { error } = await supabaseClient
      .from('habits')
      .update({ is_done: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Ошибка обновления привычки в Supabase:', error);
      habit.is_done = previousStatus;
      renderHabits();
    }
  } catch (err) {
    console.error('Сетевая ошибка при обновлении привычки:', err);
    habit.is_done = previousStatus;
    renderHabits();
  }
}

// Удаление привычки
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

async function init() {
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

  // Сначала загружаем user_stats и проверяем новый день / сброс привычек
  await fetchUserStats();

  // Затем загружаем актуальный список привычек
  await fetchHabits();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

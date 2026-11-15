// Инициализация Telegram Web App SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Ключ для хранения в localStorage
const STORAGE_KEY = 'tg_habits';

// Элементы DOM
const habitForm = document.getElementById('habit-form');
const habitInput = document.getElementById('habit-input');
const habitList = document.getElementById('habit-list');
const emptyState = document.getElementById('empty-state');

// Загрузка привычек из localStorage
let habits = loadHabits();

function loadHabits() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Ошибка загрузки привычек из localStorage:', e);
    return [];
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

// Безопасное экранирование текста для HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Тактильный отклик через Telegram WebApp (если доступен)
function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  }
}

// Отрисовка списка привычек
function renderHabits() {
  habitList.innerHTML = '';

  if (habits.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

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
      <button class="delete-btn" aria-label="Удалить привычку">&times;</button>
    `;

    // Переключение статуса выполнения при клике на содержимое
    const habitContent = li.querySelector('.habit-content');
    habitContent.addEventListener('click', () => {
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

// Добавление новой привычки
function addHabit(text) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const newHabit = {
    id: Date.now().toString(),
    text: trimmedText,
    completed: false
  };

  habits.push(newHabit);
  saveHabits();
  renderHabits();
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
  triggerHaptic('light');
}

// Удаление привычки
function deleteHabit(id) {
  habits = habits.filter((habit) => habit.id !== id);
  saveHabits();
  renderHabits();
  triggerHaptic('medium');
}

// Обработчик отправки формы
habitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addHabit(habitInput.value);
  habitInput.value = '';
  habitInput.focus();
});

// Первоначальный рендеринг при загрузке страницы
renderHabits();

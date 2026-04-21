// ============================
// Работа с пользователями
// ============================
async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.is_active ? '✔' : '✘'}</td>
      <td><button onclick="deleteUser('${u.username}')">Удалить</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteUser(username) {
  if (!confirm('Удалить пользователя ' + username + '?')) return;
  const res = await fetch('/api/admin/users/' + username, { method: 'DELETE' });
  if (res.ok) {
    alert('Пользователь удалён');
    loadUsers();
  } else {
    alert('Ошибка удаления');
  }
}

// ============================
// Работа с лимитом загрузки
// ============================
async function loadLimit() {
  const res = await fetch('/api/admin/upload-limit');
  const data = await res.json();
  document.getElementById('limitRange').value = data.upload_limit_mb;
  document.getElementById('limitValue').textContent = data.upload_limit_mb + ' МБ';
}

document.getElementById('limitRange').addEventListener('input', (e) => {
  document.getElementById('limitValue').textContent = e.target.value + ' МБ';
});

document.getElementById('saveLimit').addEventListener('click', async () => {
  const raw = document.getElementById('limitRange').value;
  const value = Number(raw);

  // 🔥 Проверка на NaN и отрицательные значения
  if (isNaN(value) || value <= 0) {
    alert('Некорректное значение лимита');
    return;
  }

  try {
    const res = await fetch('/api/admin/upload-limit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_limit_mb: value })
    });
    if (res.ok) {
      alert('Лимит обновлён: ' + value + ' МБ');
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Ошибка обновления лимита');
    }
  } catch (err) {
    alert('Ошибка сети при обновлении лимита');
  }
});

// ============================
// Старт
// ============================
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  loadLimit();
});

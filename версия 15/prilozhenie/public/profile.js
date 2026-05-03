const profileApi = {
  async getProfile() {
    const res = await fetch('/api/profile', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/';
      return null;
    }
    if (!res.ok) throw new Error('Не удалось загрузить профиль');
    return res.json();
  },

  async updateProfile(data) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.status === 401) {
      window.location.href = '/';
      return null;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Не удалось сохранить профиль');
    }
    return res.json();
  },

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Ошибка загрузки аватара');
    }
    return res.json();
  },

  async deleteAvatar() {
    const res = await fetch('/api/profile/avatar', {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Ошибка удаления аватара');
    }

    return res.json();
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  }
};

function initialsFromProfile(p) {
  const parts = [];
  if (p.first_name) parts.push(p.first_name[0]);
  if (p.last_name) parts.push(p.last_name[0]);
  if (!parts.length && p.display_name) parts.push(p.display_name[0]);
  if (!parts.length && p.username) parts.push(p.username[0]);
  return parts.join('').toUpperCase();
}

// 🔥 Функция для квадратного предпросмотра (128×128)
function makeSquarePreview(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 512; // 🔥 совпадает с сервером
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const scale = Math.max(size / img.width, size / img.height);
      const x = (size - img.width * scale) / 2;
      const y = (size - img.height * scale) / 2;

      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      callback(canvas.toDataURL('image/png'));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function initProfilePage() {
  const displayNameInput = document.getElementById('profile-display-name');
  const firstNameInput = document.getElementById('profile-first-name');
  const lastNameInput = document.getElementById('profile-last-name');
  const emailInput = document.getElementById('profile-email');
  const phoneInput = document.getElementById('profile-phone');
  const statusEl = document.getElementById('profile-status');
  const titleEl = document.getElementById('profile-display-name-title');
  const usernameLineEl = document.getElementById('profile-username-line');
  const avatarInitialsEl = document.getElementById('profile-avatar-initials');
  const avatarPreview = document.getElementById('profile-avatar-preview');
  const avatarFileInput = document.getElementById('profile-avatar-file');

  try {
    const profile = await profileApi.getProfile();
    if (!profile) return;

    displayNameInput.value = profile.display_name || '';
    firstNameInput.value = profile.first_name || '';
    lastNameInput.value = profile.last_name || '';
    emailInput.value = profile.email || '';
    phoneInput.value = profile.phone || '';

    const title = profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username;
    titleEl.textContent = title || 'Профиль';
    usernameLineEl.textContent = `Логин: ${profile.username}`;
    document.getElementById('profile-role-line').textContent = `Роль: ${profile.role}`;


    if (profile.avatar_url) {
      avatarPreview.src = profile.avatar_url;
      avatarPreview.style.display = 'block';
      avatarInitialsEl.style.display = 'none';
    } else {
      avatarInitialsEl.textContent = initialsFromProfile(profile);
      avatarInitialsEl.style.display = 'block';
      avatarPreview.style.display = 'none';
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message || 'Ошибка загрузки профиля';
  }

  // 🔥 Предпросмотр через canvas (128×128)
  avatarFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    makeSquarePreview(file, (dataUrl) => {
      avatarPreview.src = dataUrl;
      avatarPreview.style.display = 'block';
      avatarInitialsEl.style.display = 'none';
    });
  });

  // 🔥 Сохранение профиля + загрузка аватара
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = 'Сохранение...';

    const data = {
      display_name: displayNameInput.value.trim(),
      first_name: firstNameInput.value.trim(),
      last_name: lastNameInput.value.trim(),
      phone: phoneInput.value.trim(),
    };

    try {
      const updated = await profileApi.updateProfile(data);
      if (!updated) return;

      const title = updated.display_name || [updated.first_name, updated.last_name].filter(Boolean).join(' ') || updated.username;
      titleEl.textContent = title || 'Профиль';
      usernameLineEl.textContent = `Логин: ${updated.username}`;

      // 🔥 Если выбран новый файл — загружаем
      const file = avatarFileInput.files[0];
      if (file) {
        const avatarRes = await profileApi.uploadAvatar(file);
        avatarPreview.src = avatarRes.avatar_url;
        avatarPreview.style.display = 'block';
        avatarInitialsEl.style.display = 'none';
      }

      statusEl.textContent = 'Профиль сохранён';
    } catch (err) {
      statusEl.textContent = err.message || 'Ошибка сохранения профиля';
    }
  });

  // 🔥 Удаление аватара
  document.getElementById('delete-avatar-btn').addEventListener('click', async () => {
    if (!confirm('Удалить фото профиля?')) return;

    try {
      await profileApi.deleteAvatar();

      avatarPreview.src = '';
      avatarPreview.style.display = 'none';

      const profile = await profileApi.getProfile();
      avatarInitialsEl.textContent = initialsFromProfile(profile);
      avatarInitialsEl.style.display = 'block';

      avatarFileInput.value = '';
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('profile-logout-btn').addEventListener('click', async () => {
    try {
      await profileApi.logout();
    } finally {
      window.location.href = '/';
    }
  });
}

document.addEventListener('DOMContentLoaded', initProfilePage);
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function login(email, password, tenantSlug) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.tenants = data.tenants;
    throw err;
  }
  return data;
}

export async function register(email, password, name, tenantName) {
  return api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, tenantName }),
  });
}

export async function getWaStatus() {
  return api('/wa/status');
}

export async function getWaQr() {
  return api('/wa/qr');
}

export async function waConnect() {
  return api('/wa/connect', { method: 'POST' });
}

export async function waDisconnect() {
  return api('/wa/disconnect', { method: 'POST' });
}

export async function getWaProfile() {
  return api('/wa/profile');
}

export async function updateWaProfile(displayName) {
  return api('/wa/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function updateWaProfilePicture(file) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/wa/profile-picture', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function getUsers() {
  const data = await api('/users');
  return data.users || [];
}

export async function createUser(email, password, name) {
  return api('/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function updateUser(id, data) {
  return api(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id) {
  return api(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function changeMyPassword(currentPassword, newPassword) {
  return api('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function getTenantsByEmail(email) {
  const data = await api(`/auth/tenants?email=${encodeURIComponent(email)}`);
  return data.tenants || [];
}

export async function forgotPassword(email, tenantSlug) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, tenantSlug: tenantSlug || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.tenants = data.tenants;
    throw err;
  }
  return data;
}

export async function resetPassword(token, newPassword) {
  return api('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function getChats() {
  const data = await api('/wa/chats');
  return data.chats || [];
}

export async function getChatMessages(chatId, limit = 50, before) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (before) params.set('before', before);
  const path = `/wa/chats/${encodeURIComponent(chatId)}/messages?${params.toString()}`;
  const data = await api(path);
  return data.messages || [];
}

export async function searchChatMessages(chatId, q) {
  if (!q?.trim()) return [];
  const data = await api(`/wa/chats/${encodeURIComponent(chatId)}/search?q=${encodeURIComponent(q.trim())}`);
  return data.messages || [];
}

export async function sendMessage(chatId, text) {
  return api('/wa/send', {
    method: 'POST',
    body: JSON.stringify({ chatId, text }),
  });
}

export function getMediaUrl(path) {
  const token = getToken();
  return `/api/wa/media?path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

export function getProfilePicUrl(chatId) {
  if (!chatId) return '';
  const token = getToken();
  return `/api/wa/profile-pic/${encodeURIComponent(chatId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export async function getMediaBlobUrl(path) {
  const token = getToken();
  const url = `/api/wa/media?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Falha ao carregar mídia');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function sendMedia(chatId, file, caption = '') {
  const token = getToken();
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('file', file);
  if (caption) form.append('caption', caption);
  const res = await fetch('/api/wa/send-media', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/**
 * Envia mídia com callback de progresso de upload (0–100).
 * @param {string} chatId
 * @param {File} file
 * @param {string} caption
 * @param {(percent: number) => void} onProgress
 */
export function sendMediaWithProgress(chatId, file, caption = '', onProgress) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const form = new FormData();
    form.append('chatId', chatId);
    form.append('file', file);
    if (caption) form.append('caption', caption);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/wa/send-media');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || xhr.statusText));
        }
      } catch {
        reject(new Error('Erro ao processar resposta'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Falha na conexão ao enviar mídia')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelado')));
    xhr.send(form);
  });
}

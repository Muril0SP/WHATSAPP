import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import {
  getWaStatus,
  getWaQr,
  waConnect,
  waDisconnect,
  getWaProfile,
  updateWaProfile,
  updateWaProfilePicture,
  getProfilePicUrl,
  getUsers,
  createUser,
} from '../api';
import './Settings.css';

const TABS = [
  { id: 'connection', label: 'Conexão' },
  { id: 'profile', label: 'Perfil WhatsApp' },
  { id: 'users', label: 'Usuários' },
];

export default function Settings() {
  const [tab, setTab] = useState('connection');
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);
  const [waProfile, setWaProfile] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profilePicSaving, setProfilePicSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [userCreating, setUserCreating] = useState(false);
  const [message, setMessage] = useState(null);

  function refreshStatus() {
    getWaStatus()
      .then((r) => setStatus(r.status))
      .catch(() => setStatus('none'));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (status === 'qr') {
      getWaQr().then((r) => setQr(r.qr || null)).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [status]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!token || !u) return;
    const parsed = JSON.parse(u);
    const tenantId = parsed?.tenant?.id;
    if (!tenantId) return;
    const socket = io({ path: '/socket.io', auth: { tenantId } });
    socket.on('qr', (data) => {
      setQr(data.qr || null);
      setStatus('qr');
    });
    socket.on('ready', () => setStatus('connected'));
    socket.on('disconnected', () => setStatus('disconnected'));
    socket.on('auth_failure', () => setStatus('auth_failure'));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (status === 'connected' && tab === 'profile') {
      getWaProfile()
        .then((p) => {
          setWaProfile(p);
          setProfileName(p.name || '');
        })
        .catch(() => setWaProfile(null));
    }
  }, [status, tab]);

  useEffect(() => {
    if (tab === 'users') {
      getUsers()
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [tab]);

  function showMsg(text, isError = false) {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  }

  function handleConnect() {
    waConnect()
      .then(() => {
        setStatus('initializing');
        showMsg('Aguardando QR Code...');
      })
      .catch((e) => showMsg(e.message, true));
  }

  function handleDisconnect() {
    waDisconnect().then(() => {
      setStatus('disconnected');
      showMsg('Desconectado');
    }).catch((e) => showMsg(e.message, true));
  }

  function handleSaveProfile() {
    const name = profileName.trim();
    if (!name) {
      showMsg('Digite um nome', true);
      return;
    }
    setProfileSaving(true);
    updateWaProfile(name)
      .then(() => {
        setWaProfile((p) => (p ? { ...p, name } : null));
        showMsg('Nome atualizado');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setProfileSaving(false));
  }

  function handleProfilePicChange(e) {
    const file = e?.target?.files?.[0];
    if (file && file.type.startsWith('image/')) setProfilePicFile(file);
  }

  function handleUploadProfilePic() {
    if (!profilePicFile) {
      showMsg('Selecione uma imagem', true);
      return;
    }
    setProfilePicSaving(true);
    updateWaProfilePicture(profilePicFile)
      .then(() => {
        setProfilePicFile(null);
        showMsg('Foto atualizada');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setProfilePicSaving(false));
  }

  function handleCreateUser(e) {
    e.preventDefault();
    const email = newUserEmail.trim();
    const password = newUserPassword.trim();
    if (!email || !password) {
      showMsg('Email e senha são obrigatórios', true);
      return;
    }
    setUserCreating(true);
    createUser(email, password, newUserName.trim() || undefined)
      .then((data) => {
        setUsers((prev) => [...prev, data.user]);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserName('');
        showMsg('Usuário criado');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setUserCreating(false));
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-header-left">
          <Link to="/" className="settings-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Conversas
          </Link>
          <h1>Configurações</h1>
        </div>
      </header>

      {message && (
        <div className={`settings-toast ${message.isError ? 'error' : ''}`}>
          {message.text}
        </div>
      )}

      <nav className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="settings-main">
        {tab === 'connection' && (
          <section className="settings-card">
            <h2>Conexão WhatsApp</h2>
            <p className={`status-badge status-${status}`}>
              {status === 'loading' && 'Carregando...'}
              {status === 'none' && 'Não conectado'}
              {status === 'initializing' && 'Iniciando...'}
              {status === 'qr' && 'Escaneie o QR Code'}
              {status === 'authenticating' && 'Autenticando...'}
              {status === 'connected' && 'Conectado'}
              {status === 'disconnected' && 'Desconectado'}
              {status === 'auth_failure' && 'Falha na autenticação'}
            </p>
            {status === 'qr' && qr && (
              <div className="qr-box">
                <QRCodeSVG value={qr} size={220} level="M" />
                <p>Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo</p>
              </div>
            )}
            {['none', 'disconnected', 'auth_failure'].includes(status) && (
              <button type="button" className="btn-connect" onClick={handleConnect}>
                Conectar WhatsApp
              </button>
            )}
            {status === 'connected' && (
              <button type="button" className="btn-disconnect" onClick={handleDisconnect}>
                Desconectar
              </button>
            )}
          </section>
        )}

        {tab === 'profile' && (
          <section className="settings-card">
            <h2>Perfil WhatsApp</h2>
            {status !== 'connected' ? (
              <p className="settings-hint">Conecte o WhatsApp para editar seu perfil.</p>
            ) : (
              <>
                <div className="profile-pic-row">
                  <div className="profile-pic-wrap">
                    {waProfile?.id ? (
                      <img
                        src={getProfilePicUrl(waProfile.id)}
                        alt=""
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span className="profile-pic-fallback" style={{ display: waProfile?.id ? 'none' : 'flex' }}>
                      {waProfile?.name?.slice(0, 2)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="profile-pic-actions">
                    <label className="btn-secondary">
                      <input type="file" accept="image/*" onChange={handleProfilePicChange} style={{ display: 'none' }} />
                      Escolher foto
                    </label>
                    {profilePicFile && (
                      <button type="button" className="btn-primary" onClick={handleUploadProfilePic} disabled={profilePicSaving}>
                        {profilePicSaving ? 'Enviando...' : 'Atualizar foto'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Nome exibido</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Seu nome no WhatsApp"
                  />
                  <button type="button" className="btn-primary" onClick={handleSaveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Salvando...' : 'Salvar nome'}
                  </button>
                </div>
                {waProfile?.number && (
                  <p className="profile-number">Número: {waProfile.number}</p>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'users' && (
          <section className="settings-card settings-card-wide">
            <h2>Usuários da plataforma</h2>
            <p className="settings-hint">Usuários que podem acessar esta conta (tenant).</p>
            <ul className="users-list">
              {users.map((u) => (
                <li key={u.id}>
                  <span className="user-email">{u.email}</span>
                  {u.name && <span className="user-name">{u.name}</span>}
                </li>
              ))}
            </ul>
            <form className="users-form" onSubmit={handleCreateUser}>
              <h3>Novo usuário</h3>
              <input
                type="email"
                placeholder="Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Senha"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Nome (opcional)"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={userCreating}>
                {userCreating ? 'Criando...' : 'Criar usuário'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

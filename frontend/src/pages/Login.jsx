import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = isRegister
        ? await register(email, password, name, tenantName)
        : await login(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>WhatsApp Plataforma</h1>
        <p className="subtitle">Conecte seu WhatsApp por QR Code</p>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <input
                type="text"
                placeholder="Nome da empresa/conta"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Aguarde...' : isRegister ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
        <button
          type="button"
          className="toggle-mode"
          onClick={() => {
            setIsRegister((v) => !v);
            setError('');
          }}
        >
          {isRegister ? 'Já tenho conta' : 'Criar conta'}
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, register } from '../api';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantOptions, setTenantOptions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setTenantOptions([]);
    setLoading(true);
    try {
      const data = isRegister
        ? await register(email, password, name, tenantName)
        : await login(email, password, tenantSlug || undefined);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/', { replace: true });
    } catch (err) {
      if (err.tenants?.length) {
        setTenantOptions(err.tenants);
        setError('Selecione a empresa para continuar');
      } else {
        setError(err.message || 'Erro ao autenticar');
      }
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
          {!isRegister && (tenantOptions.length > 0 ? (
            <select
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              required
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: '#2a3942',
                color: '#e9edef',
                border: 'none',
                fontSize: '0.9375rem',
              }}
            >
              <option value="">Selecione a empresa</option>
              {tenantOptions.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Empresa (slug, se tiver múltiplas contas)"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              title="Ex: minha-empresa"
            />
          ))}
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
        {!isRegister && (
          <Link to="/esqueci-senha" className="forgot-link">
            Esqueci minha senha
          </Link>
        )}
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword, getTenantsByEmail } from '../api';
import './Login.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantOptions, setTenantOptions] = useState([]);
  const [checkingTenants, setCheckingTenants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleEmailBlur() {
    if (!email.trim()) return;
    setCheckingTenants(true);
    setTenantOptions([]);
    try {
      const tenants = await getTenantsByEmail(email.trim());
      setTenantOptions(tenants);
      if (tenants.length === 1) setTenantSlug(tenants[0].slug);
      else setTenantSlug('');
    } catch (_) {
      setTenantOptions([]);
    } finally {
      setCheckingTenants(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email.trim(), tenantSlug || undefined);
      setSent(true);
    } catch (err) {
      if (err.tenants?.length) {
        setTenantOptions(err.tenants);
        setError('Selecione a empresa');
      } else {
        setError(err.message || 'Erro ao enviar');
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>E-mail enviado</h1>
          <p className="subtitle">
            Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <Link to="/login" className="toggle-mode" style={{ display: 'inline-block', marginTop: 16 }}>
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Esqueci minha senha</h1>
        <p className="subtitle">Informe seu e-mail para receber o link de redefinição.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={handleEmailBlur}
            required
          />
          {tenantOptions.length > 1 && (
            <select
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
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
                <option key={t.slug} value={t.slug}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || (tenantOptions.length > 1 && !tenantSlug)}>
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
        <Link to="/login" className="forgot-link">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}

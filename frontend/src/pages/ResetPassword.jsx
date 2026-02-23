import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api';
import './Login.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Link inválido ou expirado');
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    if (newPassword.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Senha alterada</h1>
          <p className="subtitle">Sua senha foi redefinida com sucesso. Faça login com a nova senha.</p>
          <Link to="/login" className="toggle-mode" style={{ display: 'inline-block', marginTop: 16 }}>
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Link inválido</h1>
          <p className="subtitle">Este link expirou ou não existe. Solicite um novo.</p>
          <Link to="/esqueci-senha" className="toggle-mode" style={{ display: 'inline-block', marginTop: 16 }}>
            Esqueci minha senha
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Nova senha</h1>
        <p className="subtitle">Digite sua nova senha abaixo.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Nova senha"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </form>
        <Link to="/login" className="forgot-link">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}

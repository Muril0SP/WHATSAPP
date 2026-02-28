import { QRCodeSVG } from 'qrcode.react';

const STATUS_LABELS = {
  loading: 'Carregando...',
  none: 'Não conectado',
  initializing: 'Iniciando...',
  qr: 'Escaneie o QR Code',
  authenticating: 'Autenticando...',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  auth_failure: 'Falha na autenticação',
  error: 'Erro',
};

export default function ConnectionCard({
  status,
  qr,
  onConnect,
  onDisconnect,
}) {
  return (
    <main className="dashboard-main">
      <section className="connection-card">
        <h2>Status da conexão</h2>
        <p className={`status-badge status-${status}`}>
          {STATUS_LABELS[status] || status}
        </p>

        {status === 'qr' && qr && (
          <div className="qr-box">
            <QRCodeSVG value={qr} size={256} level="M" />
            <p>
              Abra o WhatsApp no celular → Dispositivos conectados → Conectar
              dispositivo
            </p>
          </div>
        )}

        {['none', 'disconnected', 'auth_failure'].includes(status) && (
          <button type="button" className="btn-connect" onClick={onConnect}>
            Conectar WhatsApp
          </button>
        )}

        {status === 'connected' && (
          <button type="button" className="btn-disconnect" onClick={onDisconnect}>
            Desconectar
          </button>
        )}

        {(status === 'initializing' || status === 'qr') && (
          <p className="hint">
            Aguarde o QR Code ou escaneie com seu celular.
          </p>
        )}
      </section>
    </main>
  );
}

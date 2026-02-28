export default function WelcomeScreen() {
  return (
    <div className="chat-placeholder welcome-screen">
      <div className="welcome-content">
        <div className="welcome-icon">
          <svg
            width="260"
            height="260"
            viewBox="0 0 256 256"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2>WhatsApp Plataforma</h2>
        <p>Envie e receba mensagens sem precisar manter o celular conectado.</p>
        <p className="welcome-hint">
          Use o WhatsApp no computador com múltiplas abas e acesse quando
          precisar.
        </p>
        <ul className="welcome-tips">
          <li>Mantenha o celular conectado à internet</li>
          <li>As mensagens são sincronizadas automaticamente</li>
          <li>O histórico fica salvo mesmo quando desconectado</li>
        </ul>
      </div>
    </div>
  );
}

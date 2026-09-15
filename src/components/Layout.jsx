import React, { useState, useEffect, useRef } from 'react';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import api from '../utils/api.js';

/* Ícones SVG (traçado 1.75, 20x20). Substituem os emojis usados antes:
   emoji varia de forma entre sistemas e não herda cor do tema. */
const ICON_PATHS = {
  tag: <><path d="M3 7v5.2a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 10.8 4H5.6A2.6 2.6 0 0 0 3 6.6Z" /><circle cx="7.5" cy="8.5" r="1.4" /></>,
  alert: <><path d="M10.3 3.9 2.5 17.2A1.9 1.9 0 0 0 4.2 20h15.6a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" /><path d="M12 9v4.2" /><path d="M12 17h.01" /></>,
  pencil: <><path d="M12.5 5.5 18 11l-9 9H3.5v-5.5Z" /><path d="m15.5 2.5 6 6" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.4 4.6h13.2a2 2 0 0 1 1.9 1.4L22 13v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l1.5-7a2 2 0 0 1 1.9-1.4Z" /></>,
  clipboard: <><rect x="8" y="2.5" width="8" height="4" rx="1.2" /><path d="M16 4.5h2A2 2 0 0 1 20 6.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" /><path d="M8.5 11.5h7" /><path d="M8.5 16h4.5" /></>,
  truck: <><path d="M2 6.5h11v10H2z" /><path d="M13 10h4.2l2.8 3.2v3.3H13z" /><circle cx="7" cy="17.8" r="1.9" /><circle cx="16.8" cy="17.8" r="1.9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.3 2" /></>,
  box: <><path d="M20.5 7.8 12 3 3.5 7.8v8.4L12 21l8.5-4.8Z" /><path d="m3.5 7.8 8.5 4.8 8.5-4.8" /><path d="M12 12.6V21" /></>,
  mail: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 5.6" /><path d="M18.2 14.2A6.5 6.5 0 0 1 21.5 20" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4.5h4.5" /><path d="M12 7.5V12l3 1.8" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M2.5 20h19" /></>,
  menu: <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  lock: <><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" /></>,
  moon: <><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" /></>,
};

function Icon({ name, size = 20, className = '' }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

const navSections = [
  {
    title: 'Geral',
    items: [
      { id: 'generate-sku', label: 'Etiquetas produtos', icon: 'tag', roles: ['admin', 'user'] },
      { id: 'warning-labels', label: 'Etiquetas de Aviso', icon: 'alert', roles: ['admin', 'user'] },
      { id: 'generate-custom', label: 'Gerar Personalizado', icon: 'pencil', roles: ['admin', 'user'] },
      { id: 'import-sales', label: 'Importar Vendas', icon: 'inbox', roles: ['admin', 'user'] },
      { id: 'picking', label: 'Listas de Picking', icon: 'clipboard', roles: ['admin', 'user'] },
    ],
  },
  {
    title: 'Admin',
    items: [
      { id: 'full', label: 'Envio Full', icon: 'truck', roles: ['admin'] },
      { id: 'full-tempo', label: 'Tempo de estoque', icon: 'clock', roles: ['admin'] },
      { id: 'skus', label: 'Gerenciar SKUs', icon: 'box', roles: ['admin'] },
      { id: 'embalagens', label: 'Embalagens', icon: 'mail', roles: ['admin'] },
      { id: 'users', label: 'Usuários', icon: 'users', roles: ['admin'] },
      { id: 'history', label: 'Histórico', icon: 'history', roles: ['admin'] },
      { id: 'sku-usage', label: 'Ranking SKUs', icon: 'chart', roles: ['admin'] },
    ],
  },
];
const requestsItem = { id: 'sku-requests', label: 'Solicitações de SKU', icon: 'mail' };

function getInitialTheme() {
  try {
    return document.documentElement.getAttribute('data-theme') || 'light';
  } catch {
    return 'light';
  }
}

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [reqCount, setReqCount] = useState(0);
  const [theme, setTheme] = useState(getInitialTheme);
  const sidebarRef = useRef(null);
  const menuBtnRef = useRef(null);

  const visibleSections = navSections
    .map(sec => ({ ...sec, items: sec.items.filter(item => item.roles.includes(user.role)) }))
    .filter(sec => sec.items.length > 0);
  const showTitles = visibleSections.length > 1;
  const allItems = [...navSections.flatMap(sec => sec.items), requestsItem];

  // Contador de solicitações de SKU pendentes (admin) — atualiza ao navegar
  useEffect(() => {
    if (user.role !== 'admin') return;
    api.get('/sku-requests/count').then(r => setReqCount(r.data.count || 0)).catch(() => {});
  }, [user.role, page]);

  // Tema: persiste e aplica na raiz do documento
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* modo privado */ }
  }, [theme]);

  // Drawer mobile: Esc fecha, foco vai para o painel, rolagem do fundo trava
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        menuBtnRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  function go(id) {
    onNavigate(id);
    setSidebarOpen(false);
  }

  function renderNavButton(item, isRequests = false) {
    const active = page === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`nav-item${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => go(item.id)}
      >
        <Icon name={item.icon} />
        <span className="nav-item-label">{item.label}</span>
        {isRequests && reqCount > 0 && (
          <span className="nav-badge" aria-label={`${reqCount} pendentes`}>{reqCount}</span>
        )}
      </button>
    );
  }

  const currentLabel = allItems.find(i => i.id === page)?.label || 'Etiquetas ZPL';

  return (
    <div className={`app-shell${sidebarOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="sidebar-overlay"
        aria-label="Fechar menu"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className="sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Navegação principal"
        aria-hidden={undefined}
      >
        <div className="sidebar-header">
          <div className="brand-mark" aria-hidden="true">ZPL</div>
          <div className="brand-text">
            <div className="brand-name">Etiquetas</div>
            <div className="brand-sub">Zebra GC420T</div>
          </div>
          <button
            type="button"
            className="sidebar-close btn-icon"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleSections.map(sec => (
            <div key={sec.title} className="nav-section">
              {showTitles && <div className="nav-section-title">{sec.title}</div>}
              {sec.items.map(item => renderNavButton(item))}
            </div>
          ))}
          {user.role === 'admin' && reqCount > 0 && (
            <div className="nav-section nav-section-footer">
              {renderNavButton(requestsItem, true)}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" aria-hidden="true">
              {(user.username || user.email || '?')[0].toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{user.username || user.email}</div>
              <span className={`badge badge-${user.role}`}>{user.role}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowChangePw(true)}
              aria-label="Trocar senha"
              title="Trocar senha"
            >
              <Icon name="lock" size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onLogout}
              aria-label="Sair da conta"
              title="Sair"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn"
            ref={menuBtnRef}
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" />
          </button>
          <span className="topbar-title">{currentLabel}</span>
        </header>

        <main className={`app-content${['full', 'full-tempo'].includes(page) ? ' is-wide' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

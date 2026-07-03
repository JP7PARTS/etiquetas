import React, { useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal.jsx';

const navItems = [
  { id: 'generate-sku', label: 'Etiquetas produtos', icon: '🏷️', roles: ['admin', 'user'] },
  { id: 'warning-labels', label: 'Etiquetas de Aviso', icon: '⚠️', roles: ['admin', 'user'] },
  { id: 'generate-custom', label: 'Gerar Personalizado', icon: '✏️', roles: ['admin', 'user'] },
  { id: 'skus', label: 'Gerenciar SKUs', icon: '📦', roles: ['admin'] },
  { id: 'users', label: 'Usuários', icon: '👥', roles: ['admin'] },
  { id: 'history', label: 'Histórico', icon: '🕑', roles: ['admin'] },
];

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div style={styles.root}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={styles.overlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, ...(sidebarOpen ? styles.sidebarOpen : {}) }}>
        <div style={styles.sidebarHeader}>
          <div style={styles.brandIcon}>ZPL</div>
          <div>
            <div style={styles.brandName}>Etiquetas</div>
            <div style={styles.brandSub}>Zebra GC420T</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {visibleItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              style={{
                ...styles.navItem,
                ...(page === item.id ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>
              {user.email[0].toUpperCase()}
            </div>
            <div style={styles.userDetails}>
              <div style={styles.userEmail}>{user.email}</div>
              <span className={`badge badge-${user.role}`}>{user.role}</span>
            </div>
          </div>
          <button
            onClick={() => setShowChangePw(true)}
            style={styles.logoutBtn}
            title="Trocar senha"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
          <button
            onClick={onLogout}
            style={styles.logoutBtn}
            title="Sair"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      {/* Main content */}
      <div style={styles.main}>
        {/* Mobile topbar */}
        <header style={styles.topbar}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={styles.menuBtn}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span style={styles.topbarTitle}>
            {visibleItems.find(i => i.id === page)?.label || 'Etiquetas ZPL'}
          </span>
        </header>

        <main style={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--content-bg)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 99,
    display: 'none',
  },
  sidebar: {
    width: '240px',
    minWidth: '240px',
    background: 'var(--nav-bg)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
    zIndex: 100,
    transition: 'transform 0.25s',
  },
  sidebarOpen: {},
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  brandIcon: {
    width: '38px',
    height: '38px',
    background: '#00b4d8',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '13px',
    color: '#fff',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  brandName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: '15px',
    lineHeight: 1.2,
  },
  brandSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '11px',
    marginTop: '2px',
  },
  nav: {
    padding: '12px 10px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.7)',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontSize: '13.5px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  navItemActive: {
    background: 'rgba(0,180,216,0.18)',
    color: '#00d4ff',
  },
  navIcon: {
    fontSize: '16px',
    flexShrink: 0,
  },
  sidebarFooter: {
    padding: '14px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: 0,
  },
  userAvatar: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#0077b6',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: 0,
  },
  userDetails: {
    flex: 1,
    minWidth: 0,
  },
  userEmail: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: '3px',
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.6)',
    border: 'none',
    borderRadius: '6px',
    padding: '7px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  topbar: {
    display: 'none',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    boxShadow: 'var(--shadow)',
  },
  menuBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  topbarTitle: {
    fontWeight: '600',
    fontSize: '15px',
    color: 'var(--text-primary)',
  },
  content: {
    flex: 1,
    padding: '28px',
    maxWidth: '900px',
    width: '100%',
  },
};

// Add responsive styles via a style tag
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @media (max-width: 768px) {
      aside[style] { position: fixed !important; transform: translateX(-100%); }
      .sidebar-open aside[style] { transform: translateX(0); }
      header[style*="display: none"] { display: flex !important; }
    }
    @media (min-width: 769px) {
      header { display: none !important; }
    }
  `;
  document.head.appendChild(styleEl);
}

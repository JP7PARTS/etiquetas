import React, { useState, useEffect } from 'react';
import Login from './components/Login.jsx';
import Layout from './components/Layout.jsx';
import SKUManagement from './components/SKUManagement.jsx';
import GenerateFromSKU from './components/GenerateFromSKU.jsx';
import GenerateCustom from './components/GenerateCustom.jsx';
import WarningLabels from './components/WarningLabels.jsx';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [page, setPage] = useState('generate-sku');

  useEffect(() => {
    // Validate token still exists
    const token = localStorage.getItem('token');
    if (!token) setUser(null);
  }, []);

  function handleLogin(userData, token) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setPage(userData.role === 'admin' ? 'generate-sku' : 'generate-sku');
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  let content;
  if (page === 'skus' && user.role === 'admin') {
    content = <SKUManagement />;
  } else if (page === 'generate-custom') {
    content = <GenerateCustom />;
  } else if (page === 'warning-labels') {
    content = <WarningLabels />;
  } else {
    content = <GenerateFromSKU />;
  }

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={handleLogout}>
      {content}
    </Layout>
  );
}

function adminLayout(title, content, user) {
  const userName = user ? (user.firstName || user.email || 'Admin') : '';
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Dram & Draught Admin</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f0f;
          color: #e0e0e0;
          min-height: 100vh;
        }
        a { color: #d4af37; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .admin-nav {
          background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .admin-nav .brand {
          font-weight: 800;
          font-size: 1.1rem;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-right: 16px;
        }
        .admin-nav a {
          color: #999;
          font-weight: 600;
          font-size: 0.9rem;
          padding: 6px 12px;
          border-radius: 6px;
          transition: background 0.2s, color 0.2s;
        }
        .admin-nav a:hover { background: #222; color: #d4af37; text-decoration: none; }
        .admin-nav a.active { color: #d4af37; background: rgba(212,175,55,0.1); }
        .nav-spacer { flex: 1; }
        .nav-user { color: #666; font-size: 0.85rem; }
        .admin-content { max-width: 1100px; margin: 0 auto; padding: 30px 24px; }
        h1 { font-size: 1.8rem; margin-bottom: 20px; color: #fff; }
        h2 { font-size: 1.3rem; margin: 20px 0 12px; color: #d4af37; }
        h3 { font-size: 1.1rem; margin: 16px 0 8px; color: #ccc; }
        .card {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .grid-7 {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .day-card {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          transition: border-color 0.2s;
        }
        .day-card:hover { border-color: #d4af37; }
        .day-card .day-name { font-weight: 700; color: #fff; font-size: 0.9rem; margin-bottom: 4px; }
        .day-card .theme-name { color: #d4af37; font-size: 0.85rem; margin-bottom: 8px; }
        .day-card .specials-count { color: #666; font-size: 0.8rem; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { text-align: left; color: #999; font-size: 0.85rem; padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
        td { padding: 10px 12px; border-bottom: 1px solid #1f1f1f; color: #ccc; }
        tr:hover td { background: #151515; }
        .btn {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          border: none;
          text-decoration: none;
          transition: filter 0.2s;
        }
        .btn:hover { filter: brightness(1.1); text-decoration: none; }
        .btn-primary { background: linear-gradient(135deg, #d4af37, #b87333); color: #111; }
        .btn-secondary { background: #2a2a2a; color: #ccc; }
        .btn-danger { background: #8b2020; color: #fff; }
        .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
        form label {
          display: block;
          color: #999;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 4px;
          margin-top: 12px;
        }
        form input[type="text"], form input[type="number"], form input[type="email"],
        form input[type="password"], form textarea, form select {
          width: 100%;
          padding: 10px 12px;
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          color: #e0e0e0;
          font-size: 0.95rem;
          font-family: inherit;
        }
        form input:focus, form textarea:focus, form select:focus {
          outline: none;
          border-color: #d4af37;
        }
        form textarea { min-height: 80px; resize: vertical; }
        .form-row { display: flex; gap: 12px; }
        .form-row > * { flex: 1; }
        .form-actions { margin-top: 20px; display: flex; gap: 10px; }
        .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
        .alert-success { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
        .alert-error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
        .special-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          background: #111;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        .special-item .name { flex: 1; font-weight: 600; color: #fff; }
        .special-item .price { color: #d4af37; font-weight: 700; }
        .special-item .desc { color: #888; font-size: 0.85rem; }
        .tag { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .tag-active { background: rgba(34,197,94,0.2); color: #4ade80; }
        .tag-inactive { background: rgba(239,68,68,0.2); color: #f87171; }
        .empty-state { text-align: center; color: #666; padding: 40px; }
        @media (max-width: 768px) {
          .grid-7 { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
          .form-row { flex-direction: column; }
          .admin-nav { gap: 8px; }
        }
      </style>
    </head>
    <body>
      <nav class="admin-nav">
        <span class="brand">D&D Admin</span>
        <a href="/admin/specials">Daily Specials</a>
        <a href="/admin/flights">Flights</a>
        <a href="/admin/bottles">Bottles</a>
        <a href="/admin/feedback">Feedback</a>
        <span class="nav-spacer"></span>
        ${user ? `<span class="nav-user">${userName}</span><a href="/admin/logout">Logout</a>` : ''}
      </nav>
      <div class="admin-content">
        ${content}
      </div>
    </body>
    </html>
  `;
}

function loginPage(error) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Dram & Draught Admin</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f0f0f;
          color: #e0e0e0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-box {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          margin: 20px;
        }
        .login-box h1 {
          text-align: center;
          font-size: 2rem;
          margin-bottom: 4px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .login-box .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 24px;
          font-size: 0.9rem;
        }
        .login-box label {
          display: block;
          color: #999;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 4px;
          margin-top: 14px;
        }
        .login-box input {
          width: 100%;
          padding: 12px;
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          color: #e0e0e0;
          font-size: 1rem;
        }
        .login-box input:focus { outline: none; border-color: #d4af37; }
        .login-box button {
          width: 100%;
          margin-top: 20px;
          padding: 12px;
          background: linear-gradient(135deg, #d4af37, #b87333);
          color: #111;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
        }
        .login-box button:hover { filter: brightness(1.1); }
        .error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 10px; border-radius: 8px; margin-bottom: 12px; text-align: center; font-size: 0.9rem; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>Dram & Draught</h1>
        <p class="subtitle">Specials Admin</p>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form method="POST" action="/admin/login">
          <label>Email</label>
          <input type="email" name="email" required autocomplete="email" />
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password" />
          <button type="submit">Sign In</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

module.exports = { adminLayout, loginPage };

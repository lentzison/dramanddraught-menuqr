const { vintageThemeCss } = require('./publicTheme');
const { brandMarkCss, renderBrandMark } = require('./brandMark');

function escHTML(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateLubricationCupPage(location) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0f1012">
      <title>The Lubrication Cup - Dram &amp; Draught ${escHTML(location.name)}</title>
      <style>
        ${vintageThemeCss()}
        ${brandMarkCss()}
        .cup-wrap {
          max-width: 640px;
          margin: 0 auto;
          padding-bottom: 40px;
        }
        .cup-hero {
          text-align: center;
          padding: 34px 18px 28px;
          border-radius: 0 0 28px 28px;
          border: 1px solid var(--line);
          border-top: 0;
          background:
            linear-gradient(180deg, rgba(24,25,28,0.97), rgba(7,7,8,0.98)),
            radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 42%);
          box-shadow: 0 22px 58px var(--shadow), inset 0 0 0 1px rgba(255,255,255,0.04);
          margin-bottom: 28px;
        }
        .cup-hero .brand-mark { max-width: 280px; margin: 0 auto 22px; }
        .cup-presents {
          color: var(--gold);
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .cup-registered {
          color: var(--muted);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .cup-title {
          font-size: 2rem;
          font-weight: 900;
          color: var(--cream);
          line-height: 1.1;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .cup-subtitle {
          color: var(--gold);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .round-card {
          background: linear-gradient(180deg, rgba(20,21,24,0.95), rgba(9,9,10,0.98));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px 20px;
          margin-bottom: 16px;
          box-shadow: 0 10px 28px rgba(0,0,0,0.25);
        }
        .round-label {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .round-name {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--cream);
          margin-bottom: 8px;
        }
        .round-desc {
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
          margin-bottom: 8px;
        }
        .round-drinks {
          color: var(--steel);
          font-size: 0.82rem;
          font-style: italic;
        }

        .judged-section {
          text-align: center;
          padding: 20px 16px;
          margin-bottom: 16px;
        }
        .judged-label {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .judged-list {
          color: var(--steel);
          font-size: 0.88rem;
          line-height: 1.8;
        }

        .menu-section {
          margin-bottom: 20px;
        }
        .menu-section-title {
          color: var(--gold);
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          text-align: center;
          margin-bottom: 6px;
        }
        .menu-section-sub {
          color: var(--muted);
          font-size: 0.78rem;
          text-align: center;
          margin-bottom: 16px;
        }
        .cocktail-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .cocktail-row:last-child { border-bottom: 0; }
        .cocktail-name {
          font-weight: 700;
          color: var(--cream);
          font-size: 0.92rem;
        }
        .cocktail-spec {
          color: var(--muted);
          font-size: 0.78rem;
          text-align: right;
          flex-shrink: 1;
          margin-left: 12px;
        }

        .signup-card {
          background: linear-gradient(180deg, rgba(28,26,22,0.96), rgba(12,11,9,0.98));
          border: 1px solid var(--gold);
          border-radius: 16px;
          padding: 28px 22px;
          margin: 28px 0;
          box-shadow: 0 12px 32px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(210,170,103,0.08);
        }
        .signup-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--cream);
          text-align: center;
          margin-bottom: 6px;
        }
        .signup-note {
          color: var(--muted);
          font-size: 0.82rem;
          text-align: center;
          line-height: 1.5;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 14px;
        }
        .form-group label {
          display: block;
          color: var(--gold);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--text);
          font-family: inherit;
          font-size: 0.92rem;
          padding: 12px 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          border-color: var(--gold);
        }
        .form-group textarea {
          resize: vertical;
          min-height: 70px;
        }
        .form-group select option {
          background: #1a1a1d;
          color: var(--text);
        }
        .submit-btn {
          display: block;
          width: 100%;
          padding: 14px;
          margin-top: 18px;
          background: linear-gradient(180deg, var(--gold), #b8913e);
          color: #0e0d0b;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.2s;
        }
        .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(210,170,103,0.25); }
        .submit-btn:active { transform: translateY(0); }
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .form-status {
          text-align: center;
          margin-top: 14px;
          font-size: 0.88rem;
          line-height: 1.5;
          min-height: 1.5em;
        }
        .form-status.success { color: #7ecf8a; }
        .form-status.error { color: #e07070; }

        .back-link {
          display: inline-block;
          margin-top: 24px;
          color: var(--gold);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-decoration: none;
        }
        .back-link:hover { text-decoration: underline; }

        .divider {
          width: 100px;
          height: 1px;
          margin: 22px auto;
          background: linear-gradient(90deg, transparent, rgba(210,170,103,0.7), transparent);
        }

        @media (max-width: 640px) {
          .cup-title { font-size: 1.55rem; }
          .round-card { padding: 18px 16px; }
          .signup-card { padding: 22px 16px; }
          .cocktail-row { flex-direction: column; gap: 2px; }
          .cocktail-spec { text-align: left; margin-left: 0; }
        }
      </style>
    </head>
    <body>
      <div class="cup-wrap">
        <div class="cup-hero">
          ${renderBrandMark({ className: '' })}
          <div class="cup-presents">Dram &amp; Draught Presents</div>
          <div class="cup-registered">The Registered</div>
          <div class="cup-title">Lubrication Cup</div>
          <div class="cup-subtitle">Bartender Speed Competition</div>
          <div class="divider"></div>
          <p style="color:var(--cream); font-size:0.92rem; font-weight:700; margin-bottom:4px;">Monday, April 20th &middot; 7:00 PM</p>
          <p style="color:var(--muted); font-size:0.82rem;">${escHTML(location.name)}</p>
        </div>

        <div class="round-card">
          <div class="round-label">Round One</div>
          <div class="round-name">Quarterfinals</div>
          <div class="round-desc">8 bartenders, head-to-head. Each builds 3 cocktails. 4 advance.</div>
          <div class="round-drinks">Manhattan &middot; Dry Martini &middot; Daiquiri &middot; Cosmopolitan</div>
        </div>

        <div class="round-card">
          <div class="round-label">Round Two</div>
          <div class="round-name">Semifinals</div>
          <div class="round-desc">4 winners go head-to-head. One cocktail decides it all.</div>
          <div class="round-drinks">Mai Tai</div>
        </div>

        <div class="round-card">
          <div class="round-label">The Final</div>
          <div class="round-name">Championship</div>
          <div class="round-desc">Last 2 standing. The ultimate test of skill and composure.</div>
          <div class="round-drinks">Ramos Gin Fizz</div>
        </div>

        <div class="judged-section">
          <div class="judged-label">Judged On</div>
          <div class="judged-list">
            Speed &middot; Accuracy &middot; Taste &middot; Presentation &middot; Station Reset &amp; Cleanliness
          </div>
        </div>

        <div class="divider"></div>

        <div class="round-card menu-section">
          <div class="menu-section-title">Event Cocktail Menu</div>
          <div class="menu-section-sub">Available for guests throughout the evening</div>
          <div class="cocktail-row">
            <span class="cocktail-name">Manhattan</span>
            <span class="cocktail-spec">Yellowstone Bourbon, Sweet Vermouth, Angostura Bitters</span>
          </div>
          <div class="cocktail-row">
            <span class="cocktail-name">Dry Martini</span>
            <span class="cocktail-spec">The Botanist Gin, Dry Vermouth, Lemon Twist or Olive</span>
          </div>
          <div class="cocktail-row">
            <span class="cocktail-name">Daiquiri</span>
            <span class="cocktail-spec">Brugal Rum, Lime, Simple Syrup</span>
          </div>
          <div class="cocktail-row">
            <span class="cocktail-name">Cosmopolitan</span>
            <span class="cocktail-spec">Tito&rsquo;s Vodka, Cointreau, Cranberry, Lime</span>
          </div>
          <div class="cocktail-row">
            <span class="cocktail-name">Mai Tai</span>
            <span class="cocktail-spec">Diplom&aacute;tico Rum, Cointreau, Lime, Orgeat</span>
          </div>
          <div class="cocktail-row">
            <span class="cocktail-name">Gin Fizz</span>
            <span class="cocktail-spec">Bombay Gin, Lemon, Simple Syrup, Soda</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="signup-card">
          <div class="signup-title">Compete in the Lubrication Cup</div>
          <div class="signup-note">
            We&rsquo;re looking for <strong>8 bartenders</strong> to compete.<br>
            Competitors arrive at <strong>6:30 PM</strong> &middot; Competition starts at <strong>7:00 PM</strong><br>
            Sign up below and Jax will be in touch with those selected.
          </div>

          <form id="signup-form" autocomplete="on">
            <div class="form-group">
              <label for="name">Full Name</label>
              <input type="text" id="name" name="name" required autocomplete="name" placeholder="Your name">
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
            </div>
            <div class="form-group">
              <label for="phone">Phone</label>
              <input type="tel" id="phone" name="phone" autocomplete="tel" placeholder="(555) 555-5555">
            </div>
            <div class="form-group">
              <label for="bar">Where do you bartend?</label>
              <input type="text" id="bar" name="bar" required placeholder="Bar / restaurant name">
            </div>
            <div class="form-group">
              <label for="experience">Years bartending</label>
              <select id="experience" name="experience" required>
                <option value="" disabled selected>Select</option>
                <option value="< 1 year">&lt; 1 year</option>
                <option value="1-3 years">1 &ndash; 3 years</option>
                <option value="3-5 years">3 &ndash; 5 years</option>
                <option value="5-10 years">5 &ndash; 10 years</option>
                <option value="10+ years">10+ years</option>
              </select>
            </div>
            <div class="form-group">
              <label for="why">Why do you want to compete? <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional)</span></label>
              <textarea id="why" name="why" rows="3" placeholder="Tell us a bit about yourself..."></textarea>
            </div>
            <button type="submit" class="submit-btn" id="submit-btn">Sign Up to Compete</button>
            <div class="form-status" id="form-status"></div>
          </form>
        </div>

        <div style="text-align:center;">
          <a class="back-link" href="/${escHTML(location.slug)}">&larr; Back to ${escHTML(location.name)}</a>
        </div>
      </div>

      <script>
        (function() {
          var form = document.getElementById('signup-form');
          var btn = document.getElementById('submit-btn');
          var status = document.getElementById('form-status');

          form.addEventListener('submit', function(e) {
            e.preventDefault();
            btn.disabled = true;
            btn.textContent = 'Submitting...';
            status.className = 'form-status';
            status.textContent = '';

            var data = {
              name: form.name.value.trim(),
              email: form.email.value.trim(),
              phone: form.phone.value.trim(),
              bar: form.bar.value.trim(),
              experience: form.experience.value,
              why: form.why.value.trim(),
              location: '${escHTML(location.slug)}'
            };

            fetch('/api/lubrication-cup-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
              if (res.ok) {
                status.className = 'form-status success';
                status.textContent = 'You\\u2019re signed up! Jax will be in touch if you\\u2019re selected.';
                form.reset();
              } else {
                status.className = 'form-status error';
                status.textContent = res.error || 'Something went wrong. Please try again.';
              }
            })
            .catch(function() {
              status.className = 'form-status error';
              status.textContent = 'Network error. Please try again.';
            })
            .finally(function() {
              btn.disabled = false;
              btn.textContent = 'Sign Up to Compete';
            });
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateLubricationCupPage };
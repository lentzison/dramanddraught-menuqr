function brandMarkCss() {
  return `
        .brand-mark {
          display: block;
          margin: 0;
          line-height: 0;
        }
        .brand-mark-image {
          display: block;
          width: 100%;
          height: auto;
          filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.34));
        }
        .brand-mark-tag {
          display: block;
          margin-top: 10px;
          color: var(--gold);
          font-family: var(--brand-display, 'Mostra One', 'Futura', sans-serif);
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          text-align: center;
        }
        @media (max-width: 640px) {
          .brand-mark-tag {
            margin-top: 8px;
            font-size: 0.7rem;
            letter-spacing: 0.18em;
          }
        }
      `;
}

function renderBrandMark({ className = '', wrapper = 'div', note = '' } = {}) {
  const safeClass = className ? ` ${className}` : '';
  const safeNote = note ? `<span class="brand-mark-tag">${note}</span>` : '';

  return `
    <${wrapper} class="brand-mark${safeClass}">
      <img class="brand-mark-image" src="/assets/dram-draught-logo-white.png" alt="Dram &amp; Draught" />
      ${safeNote}
    </${wrapper}>
  `;
}

module.exports = { brandMarkCss, renderBrandMark };

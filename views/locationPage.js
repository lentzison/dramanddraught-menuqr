const { getLinkButtons, getOpenState } = require('../helpers');

function generateLocationPage(location) {
  const quickLinks = [
    { label: "Today's Specials", url: `/${location.slug}/specials` },
    { label: 'On Draft', url: `/${location.slug}/draft` },
  ];
  const dynamicLinks = getLinkButtons(location);
  const buttons = [...quickLinks, ...dynamicLinks].filter((link, index, arr) =>
    arr.findIndex((entry) => entry.url === link.url && entry.label === link.label) === index
  );
  const reviewEmail = String(location.email || 'cheers@dramanddraught.com').trim();
  const reviewConfig = {
    locationName: location.name || 'Dram & Draught',
    locationEmail: reviewEmail || 'cheers@dramanddraught.com',
    googleReviewUrl: String(location.googleReviewUrl || '').trim(),
    feedbackEndpoint: '/api/feedback',
    locationSlug: location.slug || '',
  };

  const openState = getOpenState(location);
  const statusClass = openState.isOpen === true ? 'status-open' : openState.isOpen === false ? 'status-closed' : 'status-unknown';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#d4af37">
      <title>Dram & Draught ${location.name} - Whiskey Bar & Cocktails</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --bg-a: #09090c;
          --bg-b: #19151d;
          --panel: #16131a;
          --line: rgba(216, 174, 73, 0.25);
          --text: #efe7d4;
          --muted: #b0a99c;
          --gold: #d9b25f;
          --amber: #b97c3d;
        }
        body {
          font-family: "Palatino Linotype", "Bodoni MT", "Trebuchet MS", Georgia, serif;
          background:
            radial-gradient(1200px 620px at 15% -8%, rgba(216, 174, 73, 0.2), transparent 60%),
            radial-gradient(1000px 520px at 100% 0%, rgba(185, 124, 61, 0.24), transparent 55%),
            linear-gradient(180deg, var(--bg-a) 0%, #0a0a0b 44%, #080809 100%);
          color: var(--text);
          min-height: 100vh;
          animation: fadeIn 0.45s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero {
          position: relative;
          overflow: hidden;
          padding: 32px 18px 30px;
          text-align: center;
          border-radius: 0 0 30px 30px;
          border: 1px solid var(--line);
          border-top: 0;
          margin: 0 auto;
          max-width: 900px;
          background:
            linear-gradient(170deg, rgba(22, 20, 24, 0.94), rgba(12, 11, 12, 0.9));
          box-shadow: 0 16px 60px rgba(0,0,0,0.55);
          min-height: 360px;
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(
              130deg,
              rgba(255,255,255,0.05),
              rgba(255,255,255,0.05) 1px,
              transparent 1px,
              transparent 6px
            );
          opacity: 0.2;
          pointer-events: none;
        }
        .hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(520px 220px at 70% 12%, rgba(255,255,255,0.06), transparent 45%),
            radial-gradient(430px 180px at 18% 74%, rgba(216, 174, 73, 0.12), transparent 50%);
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.7;
        }
        .hero h1 {
          position: relative;
          color: #fff;
          font-size: clamp(2.1rem, 9vw, 3.4rem);
          letter-spacing: 0.06em;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #f3d7a5, var(--gold), var(--amber));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
        }
        .hero-title { position: relative; }
        .hero-subtitle { position: relative; font-size: clamp(1.1rem, 4vw, 1.55rem); color: #f8efe2; text-transform: uppercase; letter-spacing: 0.13em; font-weight: 700; }
        .divider { position: relative; width: 160px; height: 2px; margin: 14px auto; background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: 0.9; border-radius: 2px; }
        .badge {
          display: inline-block;
          color: var(--gold);
          border: 1px solid var(--line);
          padding: 6px 14px;
          border-radius: 999px;
          letter-spacing: 0.14em;
          font-weight: 700;
          font-size: 0.74rem;
          text-transform: uppercase;
          background: rgba(214, 175, 71, 0.08);
          margin: 4px auto 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-transform: none;
        }
        .container { position: relative; max-width: 720px; margin: 0 auto; padding: 28px 22px 30px; }
        .status-line {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          border: 1px solid #2a2a2c;
          border-radius: 999px;
          padding: 7px 14px;
          font-size: 0.84rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
        }
        .status-open { color: #22c55e; border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.11); }
        .status-closed { color: #f59e0b; border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.11); }
        .status-unknown { color: #9ca3af; border-color: rgba(156,163,175,0.4); background: rgba(156,163,175,0.11); }
        .rl-desc {
          color: var(--muted);
          max-width: 780px;
          margin: 14px auto 0;
          line-height: 1.65;
        }
        .rl-card {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 18px 16px;
          max-width: 780px;
          margin: 14px auto 0;
          color: #d7d3c9;
          line-height: 1.65;
          box-shadow: 0 12px 30px rgba(0,0,0,0.4);
        }
        .rl-card p { margin: 0.45rem 0; }
        .rl-strong { color: #e2c884; font-weight: 800; }
        .linktree { max-width: 680px; margin: 0 auto; padding-top: 10px; }
        .link-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          text-decoration: none;
          text-align: center;
          color: #19150c;
          background: linear-gradient(135deg,#d9b25f,#bb7e41 70%, #9e5f31);
          padding: 16px 22px;
          border-radius: 14px;
          font-weight: 800;
          margin: 12px 0;
          box-shadow: 0 10px 24px rgba(0,0,0,0.45);
          transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
          min-height: 56px;
          border: 1px solid rgba(255,255,255,0.14);
        }
        .link-btn:hover { transform: translateY(-2px) scale(1.01); filter: saturate(1.08); box-shadow: 0 12px 28px rgba(0,0,0,0.6); }
        .link-btn:focus-visible { outline: 2px solid #f8e7a8; outline-offset: 2px; }
        .chip {
          background: rgba(26, 27, 32, 0.75);
          color: #d5d2c4;
          border: 1px solid var(--line);
          padding: 6px 11px;
          border-radius: 999px;
          font-size: .85rem;
        }
        .chip a { color: inherit; text-decoration: none; }
        .stagger { animation: rise 0.45s ease both; }
        .stagger:nth-child(2) { animation-delay: 0.05s; }
        .stagger:nth-child(3) { animation-delay: 0.1s; }
        .stagger:nth-child(4) { animation-delay: 0.15s; }
        .review-cta {
          max-width: 680px;
          margin: 20px auto 2px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(12, 11, 12, 0.85);
          padding: 18px 16px 16px;
          text-align: center;
        }
        .review-cta h3 {
          color: #eed6a3;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
          font-size: 0.92rem;
        }
        .review-copy {
          color: #b0a99c;
          margin-bottom: 12px;
          line-height: 1.4;
          font-size: 0.93rem;
        }
        .feedback-optin {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 8px 0 12px;
          color: #d0c5b2;
          font-size: 0.83rem;
          line-height: 1.3;
          text-align: left;
          letter-spacing: 0.03em;
        }
        .feedback-optin input {
          margin-top: 2px;
          width: auto;
        }
        .feedback-optin span {
          flex: 1;
          text-transform: none;
        }
        .feedback-form {
          margin: 0 auto 8px;
          max-width: 640px;
          display: none;
        }
        .feedback-fields {
          margin-top: 6px;
          text-align: left;
        }
        .feedback-form input,
        .feedback-form textarea,
        .feedback-form button {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #2f2d30;
          font-family: inherit;
          font-size: 0.95rem;
          box-sizing: border-box;
        }
        .feedback-form input,
        .feedback-form textarea {
          background: #101014;
          color: #e8dfcd;
          padding: 10px 12px;
          margin-bottom: 8px;
        }
        .feedback-form textarea {
          min-height: 120px;
          resize: vertical;
        }
        .feedback-form button {
          background: linear-gradient(135deg,#d9b25f,#bb7e41 70%, #9e5f31);
          color: #19150c;
          border: 1px solid rgba(255,255,255,0.14);
          padding: 12px;
          font-weight: 800;
          min-height: 48px;
          cursor: pointer;
        }
        .feedback-form button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .feedback-form label {
          display: block;
          text-align: left;
          color: #d0c5b2;
          font-size: 0.84rem;
          letter-spacing: 0.05em;
          margin: 0 0 6px;
          text-transform: uppercase;
        }
        .review-stars {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .review-star {
          appearance: none;
          border: 0;
          background: transparent;
          color: #4f4a3f;
          font-size: 2rem;
          cursor: pointer;
          line-height: 1;
          transition: transform 0.15s ease, color 0.15s ease;
        }
        .review-star:hover,
        .review-star:focus-visible {
          color: #d9b25f;
          transform: translateY(-1px) scale(1.08);
        }
        .review-star[aria-pressed="true"] {
          color: #d9b25f;
        }
        .review-hint {
          color: #9d9485;
          font-size: 0.9rem;
          min-height: 1.4rem;
        }
        .review-success {
          color: #86efac;
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="hero">
        <h1 class="hero-title">Dram & Draught</h1>
        <h2 class="hero-subtitle">${location.name}</h2>
        <div class="divider"></div>
        <div class="badge">REGISTERED LUBRICATION</div>
        ${openState.isOpen === null ? '' : `
        <div class="status-line ${statusClass}">
          ${openState.status}${openState.todayHours ? ` · ${openState.todayHours}` : ''}
        </div>
        `}
        <div class="rl-card">
          <p>Our first home was a converted service station, back when a sign for "Registered Lubrication" actually meant you could count on getting quality fluids. We liked the idea, so we kept the name. Only now, instead of motor oil, it's bourbon in your Old Fashioned and cocktails built to keep the night running smooth.</p>
          <p class="rl-strong">Same promise of quality, just more fun.</p>
        </div>
      </div>
      <div class="container linktree">
        ${buttons.map((l, i) => `<a class="link-btn stagger" href="${l.url}"${l.url.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"'} style="animation-delay:${Math.min(i * 0.04, 0.2)}s;"><span>${l.label}</span></a>`).join('')}
      </div>
      <div class="review-cta">
        <h3>Rate your visit</h3>
        <p class="review-copy">
          Tap a star. 5 stars opens a Google review after your note is sent.
        </p>
        <div class="review-stars" role="radiogroup" aria-label="Guest rating">
          <button class="review-star" type="button" role="radio" aria-label="Rate 1 star" data-rating="1" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 2 stars" data-rating="2" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 3 stars" data-rating="3" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 4 stars" data-rating="4" aria-pressed="false">★</button>
          <button class="review-star" type="button" role="radio" aria-label="Rate 5 stars" data-rating="5" aria-pressed="false">★</button>
        </div>
        <form id="feedback-form" class="feedback-form" action="/api/feedback" method="POST" autocomplete="on">
          <input type="hidden" id="feedback-rating" name="rating" value="" />
          <div class="feedback-fields">
            <label for="feedback-name">Name</label>
            <input id="feedback-name" name="name" type="text" placeholder="Guest name (optional)" />
            <label for="feedback-email">Email</label>
            <input id="feedback-email" name="email" type="email" placeholder="you@email.com" />
            <label for="feedback-message">Share your feedback</label>
            <textarea id="feedback-message" name="feedback" placeholder="What was great, and what can we improve?"></textarea>
            <label class="feedback-optin" for="feedback-newsletter-optin">
              <input id="feedback-newsletter-optin" name="newsletterOptIn" type="checkbox" />
              <span>Sign me up for the newsletter with special events, new releases, and tasting updates.</span>
            </label>
          </div>
          <button id="feedback-submit" type="submit">Send feedback</button>
        </form>
        <p id="review-hint" class="review-hint">Tap a star to share feedback.</p>
      </div>
      <script>
        (function() {
          const config = ${JSON.stringify(reviewConfig)};
          const stars = Array.from(document.querySelectorAll('.review-star'));
          const hint = document.getElementById('review-hint');
          const feedbackForm = document.getElementById('feedback-form');
          const feedbackNameInput = document.getElementById('feedback-name');
          const feedbackMessageInput = document.getElementById('feedback-message');
          const feedbackEmailInput = document.getElementById('feedback-email');
          const feedbackNewsletterInput = document.getElementById('feedback-newsletter-optin');
          const feedbackRatingInput = document.getElementById('feedback-rating');
          const feedbackSubmitButton = document.getElementById('feedback-submit');
          if (!stars.length || !hint) return;

          function highlight(rating) {
            stars.forEach((btn) => {
              const value = Number(btn.getAttribute('data-rating') || '0');
              btn.setAttribute('aria-pressed', value <= rating ? 'true' : 'false');
            });
          }

          function setHint(message, isSuccess) {
            hint.textContent = message;
            hint.classList.toggle('review-success', Boolean(isSuccess));
          }

          function sanitize(value) {
            return String(value || '').trim();
          }

          function isLikelyValidEmail(value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitize(value));
          }

          function setFieldRequired(requireEmail, requireFeedback) {
            if (feedbackEmailInput) feedbackEmailInput.required = Boolean(requireEmail);
            if (feedbackMessageInput) feedbackMessageInput.required = Boolean(requireFeedback);
          }

          function hideFeedbackForm() {
            if (!feedbackForm) return;
            feedbackForm.style.display = 'none';
            feedbackRatingInput.value = '';
            if (feedbackNameInput) feedbackNameInput.value = '';
            if (feedbackEmailInput) feedbackEmailInput.value = '';
            if (feedbackMessageInput) feedbackMessageInput.value = '';
            if (feedbackNewsletterInput) feedbackNewsletterInput.checked = false;
            setFieldRequired(false, false);
          }

          function showFeedbackForm(rating) {
            if (!feedbackForm) return;
            const isFiveStar = Number(rating || 0) === 5;
            feedbackForm.style.display = 'block';
            feedbackRatingInput.value = String(rating);
            if (feedbackMessageInput) {
              feedbackMessageInput.value = isFiveStar ? 'Guest gave a 5-star rating.' : '';
              feedbackMessageInput.placeholder = isFiveStar
                ? 'Tell us what you loved about your visit (optional for 5 stars).'
                : 'What was great, and what can we improve?';
            }
            setFieldRequired(true, !isFiveStar);
            setHint(isFiveStar
              ? 'You selected 5/5. Leave your email to get a personal thanks.'
              : 'You selected ' + rating + '/5. Share a few details and we will review them right away.');
            const emailInput = document.getElementById('feedback-email');
            if (emailInput) emailInput.focus();
          }

          function copyReviewTextToClipboard(reviewText) {
            var prepared = sanitize(reviewText);
            if (!prepared) return Promise.resolve(false);
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              return navigator.clipboard.writeText(prepared)
                .then(function() {
                  return true;
                })
                .catch(function() {
                  return fallbackCopyToClipboard(prepared);
                });
            }
            return Promise.resolve(fallbackCopyToClipboard(prepared));
          }

          function fallbackCopyToClipboard(text) {
            try {
              var textarea = document.createElement('textarea');
              textarea.value = text;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'absolute';
              textarea.style.left = '-9999px';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              var success = document.execCommand('copy');
              document.body.removeChild(textarea);
              return success;
            } catch (err) {
              return false;
            }
          }

          function buildReviewText(rating, feedbackText) {
            return 'Review for ' + config.locationName + ' (' + rating + '/5):\\n\\n' + sanitize(feedbackText || 'Guest had a great visit.');
          }

          function offerGoogleReview(rating, feedbackText) {
            if (!config.googleReviewUrl) return;
            const reviewTextForGoogle = buildReviewText(rating, feedbackText);
            copyReviewTextToClipboard(reviewTextForGoogle).then(function(copied) {
              if (copied) {
                setHint('Opening Google review. Your review was copied so you can paste it there.', true);
              } else {
                setHint('Opening Google review. Please paste your review text manually.', true);
              }
              window.open(config.googleReviewUrl, '_blank', 'noopener,noreferrer');
            });
          }

          async function submitFeedback(payload, options) {
            const isFiveStar = payload.rating === 5;
            const feedbackPayload = {
              locationSlug: config.locationSlug,
              rating: Number(payload.rating || 0),
              name: sanitize(payload.name || ''),
              email: sanitize(payload.email || ''),
              feedback: sanitize(payload.feedback || ''),
              newsletterOptIn: Boolean(payload.newsletterOptIn),
            };

            if (!feedbackPayload.rating) {
              setHint('Please select a star first.');
              return;
            }

            if (!feedbackPayload.email || !isLikelyValidEmail(feedbackPayload.email)) {
              setHint('Please provide a valid email address.');
              return;
            }

            if (!isFiveStar && !feedbackPayload.feedback) {
              setHint('Please share your feedback message.');
              return;
            }

            if (isFiveStar && !feedbackPayload.feedback) {
              feedbackPayload.feedback = 'Guest gave a 5-star rating.';
            }

            feedbackSubmitButton && (feedbackSubmitButton.disabled = true);
            setHint(options && options.hint ? options.hint : 'Sending your feedback...');
            try {
              const response = await fetch(config.feedbackEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify(feedbackPayload),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data.ok) {
                setHint(data.error || 'Could not send feedback right now. Please try again in a moment.');
                return;
              }

              if (isFiveStar) {
                if (config.googleReviewUrl) {
                  offerGoogleReview(isFiveStar, feedbackPayload.feedback || 'Guest gave a 5-star rating.');
                }
              }

              if (feedbackForm) feedbackForm.style.display = 'none';

              if (isFiveStar) {
                if (data.delivery && data.delivery.guest) {
                  setHint('Thanks for the 5-star rating. We sent your confirmation and we shared it with our team.', true);
                } else {
                  setHint('Thanks for the 5-star rating. We shared it with our team.', false);
                }
                return;
              }

              if (data.delivery && data.delivery.guest) {
                setHint('Thank you! We sent a personalized confirmation to your email.', true);
              } else {
                const guestError = data.delivery && data.delivery.errors && data.delivery.errors.guest
                  ? data.delivery.errors.guest
                  : null;
                const detail = guestError
                  ? (guestError.code ? String(guestError.code) : 'unknown_error')
                    + (guestError.detail ? ' (' + String(guestError.detail) + ')' : '')
                  : '';
                const errorCode = String(guestError && guestError.code ? guestError.code : '').toLowerCase();
                const errorDetail = String(guestError && guestError.detail ? guestError.detail : '').toLowerCase();
                const isMissingRecipientError = /missing_recipient|gmail_send_failed_400|recipient address required/.test(errorCode)
                  || /recipient address required/.test(errorDetail);
                if (isMissingRecipientError) {
                  setHint('Thanks for sharing. We could not send a confirmation email automatically, but we logged your feedback with the team.', false);
                } else {
                  setHint('Thanks for sharing. We could not send the confirmation email automatically just now.' + detail, false);
                }
              }

            } catch (err) {
              setHint('Something went wrong while sending your feedback. Please try again in a moment.');
            } finally {
              feedbackSubmitButton && (feedbackSubmitButton.disabled = false);
            }
          }

          stars.forEach((star) => {
            star.addEventListener('click', async () => {
              const rating = Number(star.getAttribute('data-rating') || '0');
              if (!Number.isFinite(rating)) return;
              highlight(rating);
              hideFeedbackForm();
              showFeedbackForm(rating);
            });
          });

          if (!feedbackForm || !feedbackSubmitButton || !feedbackMessageInput) return;
          feedbackForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (feedbackSubmitButton.disabled) return;
            const payload = {
              rating: Number(feedbackRatingInput && feedbackRatingInput.value ? feedbackRatingInput.value : 0),
              name: sanitize((feedbackNameInput && feedbackNameInput.value) || ''),
              email: sanitize((feedbackEmailInput && feedbackEmailInput.value) || ''),
              feedback: sanitize(feedbackMessageInput.value),
              newsletterOptIn: feedbackNewsletterInput && feedbackNewsletterInput.checked,
            };
            await submitFeedback(payload, {
              hint: 'Sending your feedback...',
            });
          });
        })();
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateLocationPage };

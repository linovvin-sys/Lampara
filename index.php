<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Campus AR Guide</title>
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --green-50:  #f0fdf4;
    --green-100: #dcfce7;
    --green-200: #bbf7d0;
    --green-300: #86efac;
    --green-500: #22c55e;
    --green-600: #16a34a;
    --green-700: #15803d;
    --green-800: #14532d;
    --moss-100:  #ecfccb;
    --moss-500:  #65a30d;
    --ink:       #14251c;
    --muted:     #5b6b63;
    --line:      #e3ede6;
  }

  * { box-sizing: border-box; }

  html, body { margin: 0; min-height: 100%; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Outfit', sans-serif;
    color: var(--ink);
    background: #ffffff;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }

  /* Layered green wash backdrop — a few different green tints so it doesn't
     read as flat white. Mobile-first: fewer, closer blobs; desktop spreads
     them out more (see media query below). */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(560px 380px at 12% -6%, var(--green-100), transparent 60%),
      radial-gradient(480px 420px at 100% 8%, var(--green-200), transparent 58%),
      radial-gradient(520px 460px at 100% 100%, var(--green-50), transparent 55%),
      radial-gradient(460px 380px at -4% 82%, var(--moss-100), transparent 58%),
      #ffffff;
  }

  @media (min-width: 1024px) {
    .backdrop {
      background:
        radial-gradient(760px 520px at 8% -10%, var(--green-100), transparent 60%),
        radial-gradient(680px 560px at 104% 4%, var(--green-200), transparent 55%),
        radial-gradient(700px 600px at 96% 104%, var(--green-50), transparent 55%),
        radial-gradient(620px 520px at -6% 88%, var(--moss-100), transparent 55%),
        #ffffff;
    }
  }

  /* ---- Nav bar (SPA: Home / About switch views, no page reload) ---- */
  .navbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--ink);
    font-weight: 700;
    font-size: 1.0625rem;
  }

  .brand .brand-mark {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.55rem;
    background: linear-gradient(155deg, var(--green-500), var(--green-700));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nav-links {
    display: flex;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .nav-link {
    display: inline-block;
    padding: 0.5rem 0.875rem;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    color: var(--muted);
    transition: background-color 160ms ease-out, color 160ms ease-out;
  }
  .nav-link:hover { background: var(--green-50); color: var(--ink); }
  .nav-link.is-active { background: var(--green-600); color: #ffffff; }

  main { flex: 1; display: flex; }

  .view { display: none; width: 100%; }
  .view.is-active { display: block; }

  /* ---- Home view ---- */
  #view-home .home-inner { padding: 0 0 3rem; }

  .hero-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100dvh - 4rem);
    padding: 2.5rem 1.5rem 2rem;
  }

  .shell {
    width: 100%;
    max-width: 26rem;
    margin: 0 auto;
    text-align: center;
  }

  .logo {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1.25rem;
    border-radius: 1.25rem;
    background: linear-gradient(155deg, var(--green-500), var(--green-700));
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12px 28px -10px rgba(22, 163, 74, 0.5);
  }

  h1 {
    font-size: 1.875rem;
    line-height: 1.2;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  .tagline {
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.6;
    margin: 0 0 2rem;
  }

  .features {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 2.25rem;
  }

  .feature-card {
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1rem 0.75rem;
    box-shadow: 0 1px 2px rgba(20, 37, 28, 0.04);
  }

  .feature-card .icon {
    width: 2.25rem;
    height: 2.25rem;
    margin: 0 auto 0.4rem;
    border-radius: 0.7rem;
    background: var(--green-50);
    color: var(--green-700);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .feature-card:nth-child(2) .icon { background: var(--green-200); }
  .feature-card:nth-child(3) .icon { background: var(--green-300); }

  .feature-card .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn {
    display: block;
    width: 100%;
    padding: 0.9rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.9375rem;
    text-decoration: none;
    text-align: center;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: transform 160ms ease-out, filter 160ms ease-out, background-color 160ms ease-out;
  }
  .btn:active { transform: scale(0.97); }

  .btn-primary {
    background: var(--green-600);
    color: #ffffff;
    box-shadow: 0 10px 24px -8px rgba(22, 163, 74, 0.45);
  }
  .btn-primary:hover { filter: brightness(1.06); }

  .btn-secondary {
    background: #ffffff;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .btn-secondary:hover { background: var(--green-50); }

  .panel { display: none; }

  /* ---- Home: extra content below the fold ---- */
  .home-extra {
    width: 100%;
    max-width: 26rem;
    margin: 0 auto;
    padding: 0 1.5rem;
  }

  .section-heading {
    text-align: center;
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 1.25rem;
  }

  .mini-steps {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.875rem;
    margin-bottom: 2.5rem;
  }

  .mini-step {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1rem;
  }

  .mini-step .mini-icon {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: var(--green-50);
    color: var(--green-700);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mini-step:nth-child(2) .mini-icon { background: var(--green-200); }
  .mini-step:nth-child(3) .mini-icon { background: var(--moss-100); }

  .mini-step .mini-title {
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: 0.2rem;
  }

  .mini-step .mini-body {
    color: var(--muted);
    font-size: 0.8438rem;
    line-height: 1.55;
  }

  .cta-banner {
    text-align: center;
    background: linear-gradient(150deg, var(--green-500) 0%, var(--green-600) 45%, var(--green-800) 100%);
    color: #ffffff;
    border-radius: 1.5rem;
    padding: 2rem 1.5rem;
  }

  .cta-banner h3 {
    font-size: 1.375rem;
    margin: 0 0 0.5rem;
  }

  .cta-banner p {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.875rem;
    line-height: 1.6;
    margin: 0 0 1.5rem;
  }

  .cta-banner .btn-primary {
    background: #ffffff;
    color: var(--green-700);
    box-shadow: none;
  }
  .cta-banner .btn-primary:hover { filter: brightness(0.97); }

  .cta-banner .learn-more {
    display: block;
    margin-top: 1rem;
    padding: 0;
    border-radius: 0;
    color: #ffffff;
    font-size: 0.8438rem;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }
  .cta-banner .learn-more:hover { background: none; color: #ffffff; }

  footer {
    text-align: center;
    color: #9aa79f;
    font-size: 0.75rem;
    padding: 1.5rem 1.5rem;
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fade-up 480ms cubic-bezier(0.23, 1, 0.32, 1) both; }
  .fade-up-1 { animation-delay: 60ms; }
  .fade-up-2 { animation-delay: 140ms; }
  .fade-up-3 { animation-delay: 220ms; }
  .fade-up-4 { animation-delay: 300ms; }
  .fade-up-5 { animation-delay: 380ms; }

  /* ---- About view ---- */
  #view-about .about-inner {
    padding: 2.5rem 1.5rem 3rem;
  }

  .about-shell {
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
  }

  .about-shell .eyebrow {
    display: inline-block;
    color: var(--green-700);
    background: var(--green-50);
    border: 1px solid var(--green-100);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    margin-bottom: 1rem;
  }

  .about-shell h2 {
    font-size: 1.625rem;
    line-height: 1.25;
    margin: 0 0 0.75rem;
  }

  .about-shell .lede {
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.7;
    margin: 0 0 2rem;
  }

  .steps {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.875rem;
    margin-bottom: 2rem;
  }

  .step {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1rem;
  }

  .step .num {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--green-600);
    color: #fff;
    font-weight: 700;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .step:nth-child(2) .num { background: var(--green-500); }
  .step:nth-child(4) .num { background: var(--moss-500); }

  .step .step-title {
    font-weight: 600;
    font-size: 0.9375rem;
    margin-bottom: 0.2rem;
  }

  .step .step-body {
    color: var(--muted);
    font-size: 0.8438rem;
    line-height: 1.55;
  }

  .why-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.875rem;
    margin-bottom: 2rem;
  }

  .why-card {
    background: linear-gradient(160deg, var(--green-50), #ffffff);
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 1.125rem;
  }
  .why-card:nth-child(2) { background: linear-gradient(160deg, var(--green-200), #ffffff); }
  .why-card:nth-child(3) { background: linear-gradient(160deg, var(--moss-100), #ffffff); }

  .why-card .why-title {
    font-weight: 700;
    font-size: 0.9375rem;
    margin-bottom: 0.35rem;
    color: var(--green-700);
  }
  .why-card:nth-child(2) .why-title { color: var(--green-700); }
  .why-card:nth-child(3) .why-title { color: var(--moss-500); }

  .why-card .why-body {
    color: var(--muted);
    font-size: 0.8438rem;
    line-height: 1.6;
  }

  .about-cta {
    text-align: center;
    border-top: 1px solid var(--line);
    padding-top: 1.75rem;
  }

  .about-cta p {
    color: var(--muted);
    font-size: 0.875rem;
    margin: 0 0 1rem;
  }

  .about-cta .btn { display: inline-block; width: auto; padding-left: 1.75rem; padding-right: 1.75rem; }

  /* Tablet and up: feature cards / steps move into rows. */
  @media (min-width: 480px) {
    .features { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (min-width: 640px) {
    .why-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .mini-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  /* Desktop: wider shell, two-column hero so the page doesn't look like a
     stretched phone screen on a big monitor. */
  @media (min-width: 1024px) {
    .navbar { padding: 1rem 3rem; }

    .hero-wrap { padding: 4rem 3rem; }

    .home-extra { max-width: 64rem; padding: 0 3rem; }
    .mini-step { padding: 1.5rem; }
    .cta-banner { padding: 3rem 4rem; }
    .cta-banner h3 { font-size: 1.75rem; }
    .cta-banner p { font-size: 0.9375rem; max-width: 32rem; margin-left: auto; margin-right: auto; }

    .shell {
      max-width: 64rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: center;
      text-align: left;
    }

    .hero { text-align: left; }
    .logo { margin: 0 0 1.5rem; }
    h1 { font-size: 2.75rem; }
    .tagline { font-size: 1.0625rem; margin-bottom: 2.5rem; max-width: 30rem; }

    .actions { flex-direction: row; }
    .btn { width: auto; padding-left: 1.75rem; padding-right: 1.75rem; }

    .hero-features { display: none; }

    .panel {
      display: block;
      background: linear-gradient(160deg, var(--green-50), #ffffff);
      border: 1px solid var(--line);
      border-radius: 1.75rem;
      padding: 2.5rem;
    }
    .panel .features { grid-template-columns: 1fr; gap: 1rem; margin-bottom: 0; }
    .panel .feature-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      text-align: left;
      padding: 1.25rem;
    }
    .panel .feature-card .icon {
      margin: 0;
      flex-shrink: 0;
      width: 2.75rem;
      height: 2.75rem;
    }
    .panel .feature-card .icon svg { width: 22px; height: 22px; }

    #view-about .about-inner { padding: 4rem 3rem; }
    .about-shell { max-width: 56rem; }
    .about-shell h2 { font-size: 2.25rem; }
    .about-shell .lede { font-size: 1.0625rem; max-width: 42rem; }
    .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
</head>
<body>

<div class="backdrop"></div>

<nav class="navbar">
  <a href="#home" class="brand nav-link-home" data-target="home">
    <span class="brand-mark">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
    </span>
    Lampara
  </a>
  <ul class="nav-links">
    <li><a href="#home" class="nav-link" data-target="home">Home</a></li>
    <li><a href="#about" class="nav-link" data-target="about">About</a></li>
  </ul>
</nav>

<main>

  <section id="view-home" class="view" data-view="home">
    <div class="home-inner">

      <div class="hero-wrap">
        <div class="shell">

          <div class="hero">
            <div class="fade-up fade-up-1 logo">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
            </div>

            <h1 class="fade-up fade-up-1">Lampara</h1>
            <p class="fade-up fade-up-2 tagline">
              Your AR-powered campus guide. Point your phone toward a building for a live
              compass arrow, scan room signage to find exactly where you're headed, or just
              ask the built-in AI assistant.
            </p>

            <div class="features hero-features fade-up fade-up-3">
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/></svg></div>
                <div class="label">AR Outdoor Guide</div>
              </div>
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div>
                <div class="label">Room Scan &amp; Search</div>
              </div>
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg></div>
                <div class="label">Ask Lampara AI</div>
              </div>
            </div>

            <div class="actions fade-up fade-up-4">
              <a href="guide.php" class="btn btn-primary">Start Navigating</a>
              <a href="admin/login.php" class="btn btn-secondary">Admin Login</a>
            </div>
          </div>

          <div class="panel fade-up fade-up-3" aria-hidden="true">
            <div class="features">
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/></svg></div>
                <div class="label">AR Outdoor Guide</div>
              </div>
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div>
                <div class="label">Room Scan &amp; Search</div>
              </div>
              <div class="feature-card">
                <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg></div>
                <div class="label">Ask Lampara AI</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div class="home-extra">

        <h2 class="section-heading">Why students reach for Lampara</h2>
        <div class="mini-steps">
          <div class="mini-step">
            <div class="mini-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg></div>
            <div>
              <div class="mini-title">No more wrong turns</div>
              <div class="mini-body">The outdoor AR arrow points straight at your building in real time, so you stop guessing which path to take.</div>
            </div>
          </div>
          <div class="mini-step">
            <div class="mini-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></svg></div>
            <div>
              <div class="mini-title">Find rooms in seconds</div>
              <div class="mini-body">Scan signage or search the directory to land on the exact office, classroom, or lab — with floor and hours.</div>
            </div>
          </div>
          <div class="mini-step">
            <div class="mini-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5-10-5Z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg></div>
            <div>
              <div class="mini-title">Made for every visit</div>
              <div class="mini-body">New student, transferee, or a parent visiting for the first time — Lampara works the same from day one.</div>
            </div>
          </div>
        </div>

        <div class="cta-banner">
          <h3>Ready to explore campus?</h3>
          <p>Start navigating now, or read more about how Lampara keeps you from getting lost.</p>
          <a href="guide.php" class="btn btn-primary">Start Navigating</a>
          <button type="button" class="learn-more nav-link" data-target="about">Learn more about Lampara &rarr;</button>
        </div>

      </div>

    </div>
  </section>

  <section id="view-about" class="view" data-view="about">
    <div class="about-inner">
      <div class="about-shell">

        <span class="eyebrow fade-up fade-up-1">About Lampara</span>
        <h2 class="fade-up fade-up-1">Never wander campus lost again.</h2>
        <p class="fade-up fade-up-2 lede">
          Lampara is an AR-powered wayfinding guide built for students, staff, and
          visitors who don't know a campus by heart. Instead of squinting at a printed
          map or wandering hallways, point your phone, scan a sign, or just ask —
          and get an answer grounded in the campus's real building and room data.
        </p>

        <div class="steps fade-up fade-up-3">
          <div class="step">
            <div class="num">1</div>
            <div>
              <div class="step-title">Point your phone</div>
              <div class="step-body">A live compass arrow overlays your camera view and points straight at the building you're heading to, using your phone's GPS and compass.</div>
            </div>
          </div>
          <div class="step">
            <div class="num">2</div>
            <div>
              <div class="step-title">Scan or search a room</div>
              <div class="step-body">Once you're inside, scan room signage or use manual search to find the exact office, classroom, or lab — with floor and hours.</div>
            </div>
          </div>
          <div class="step">
            <div class="num">3</div>
            <div>
              <div class="step-title">Ask Lampara AI</div>
              <div class="step-body">Not sure what to look for? Ask in plain language — the assistant answers using real, up-to-date campus building and room records.</div>
            </div>
          </div>
          <div class="step">
            <div class="num">4</div>
            <div>
              <div class="step-title">Flag what's outdated</div>
              <div class="step-body">Found a wrong room number or old office hours? Report it in one tap so admins can keep the directory accurate for everyone else.</div>
            </div>
          </div>
        </div>

        <div class="why-grid fade-up fade-up-4">
          <div class="why-card">
            <div class="why-title">Built for mobile</div>
            <div class="why-body">Designed first for the phone in your pocket — the way most students actually find their way around.</div>
          </div>
          <div class="why-card">
            <div class="why-title">Always current</div>
            <div class="why-body">Admins manage buildings and rooms directly, so directions and room info stay accurate as campus changes.</div>
          </div>
          <div class="why-card">
            <div class="why-title">Works offline</div>
            <div class="why-body">Manual search caches the directory on your device, so you can still find a room with a weak signal.</div>
          </div>
        </div>

        <div class="about-cta fade-up fade-up-5">
          <p>Ready to find your way?</p>
          <a href="guide.php" class="btn btn-primary">Start Navigating</a>
        </div>

      </div>
    </div>
  </section>

</main>

<footer>
  Lampara &mdash; find your way around campus.
</footer>

<script>
(function () {
  var views = document.querySelectorAll('.view');
  var links = document.querySelectorAll('.nav-link, .nav-link-home');

  function resolveView() {
    var hash = (location.hash || '').replace('#', '');
    return hash === 'about' ? 'about' : 'home';
  }

  function render(name, updateHash) {
    views.forEach(function (v) {
      v.classList.toggle('is-active', v.dataset.view === name);
    });
    links.forEach(function (l) {
      l.classList.toggle('is-active', l.dataset.target === name);
    });
    if (updateHash && location.hash !== '#' + name) {
      history.pushState(null, '', '#' + name);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      render(link.dataset.target, true);
    });
  });

  window.addEventListener('popstate', function () {
    render(resolveView(), false);
  });

  render(resolveView(), false);
})();
</script>

</body>
</html>

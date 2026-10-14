<?php
// Shared admin nav — include after setting $activeNav (one of the keys below).
// Renders a hamburger-triggered off-canvas drawer on mobile and a static
// sidebar with icons + a profile card on desktop (see Frontend/Css/Admin/admin.css
// for the breakpoint and drawer/sidebar styles, and Frontend/Js/Include/admin-nav.js
// for the open/close behavior).

require_once __DIR__ . '/../../../Backend/session_boot.php';
lampara_session_start();

// Embedded inside the Buildings workspace (?embed=1): no sidebar or header, just the page's own content.
if (isset($_GET['embed'])) { ?>
<script>document.documentElement.classList.add('is-embed')</script>
<link rel="stylesheet" href="../../assets/css/tw.css?v=<?= filemtime(__DIR__ . '/../../assets/css/tw.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-ux.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-ux.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-v2.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-v2.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-mobile.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-mobile.css') ?>">
<script defer src="../../Js/Include/admin-ux.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-ux.js') ?>"></script>
<script src="../../Js/Include/admin-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-offline.js') ?>"></script>
<script src="../../Js/Include/admin-savestate.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-savestate.js') ?>"></script>
<script src="../../Js/Include/admin-toast.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-toast.js') ?>"></script>
<script src="../../Js/Include/dropzone.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/dropzone.js') ?>"></script>
<?php return; }
$adminUsername = $_SESSION['admin_username'] ?? 'Admin';

$navItems = [
    'dashboard' => [
        'label' => 'Dashboard',
        'href'  => 'dashboard.php',
        'icon'  => '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    ],
    'hazards' => [
        'label' => 'Reports',
        'href'  => 'hazards.php',
        'icon'  => '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
    ],
    'enrollment-steps' => [
        'label' => 'Enrollment steps',
        'href'  => 'enrollment-steps.php',
        'icon'  => '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    ],
    // Dropdown: the campus-wide map content (walkways and the static campus map).
    'campus-editor' => [
        'label' => 'Campus Editor',
        'icon'  => '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/>',
        'children' => [
            'campus-paths' => [
                'label' => 'Walking paths',
                'href'  => 'campus-paths.php',
                'icon'  => '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17c4-1 2-6 5-8s3-2 3-2"/>',
            ],
            'building-outlines' => [
                'label' => 'Link buildings to the map',
                'href'  => 'building-outlines.php',
                'icon'  => '<path d="M4 8l8-4 8 4v8l-8 4-8-4Z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
            ],
            'campus-map' => [
                'label' => 'Campus Map',
                'href'  => 'campus-map.php',
                'icon'  => '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/>',
            ],
        ],
    ],
    // Dropdown: everything about the buildings themselves (rooms, floors, indoor setup).
    'building-editor' => [
        'label' => 'Building Editor',
        'icon'  => '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/>',
        'children' => [
            'manage-buildings' => [
                'label' => 'Buildings and rooms',
                'href'  => 'buildings.php',
                'icon'  => '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/>',
            ],
            'building-edit' => [
                'label' => 'Building editor',
                'href'  => 'building-edit.php',
                'icon'  => '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/>',
            ],
            'room-edit' => [
                'label' => 'Rooms',
                'href'  => 'room-edit.php',
                'icon'  => '<path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/>',
            ],
        ],
    ],
    'settings' => [
        'label' => 'School settings',
        'href'  => 'settings.php',
        'icon'  => '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    ],
    'data-pack' => [
        'label' => 'Backup and import',
        'href'  => 'data-pack.php',
        'icon'  => '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    ],
    'account' => [
        'label' => 'Account',
        'href'  => 'account.php',
        'icon'  => '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    ],
    'doors' => [
        'label' => 'Entrances and exits',
        'href'  => 'doors.php',
        'icon'  => '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16M14 12v.01"/>',
    ],
    'test-chat' => [
        'label' => 'Test the assistant',
        'href'  => 'test-chat.php',
        'icon'  => '<path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/>',
    ],
];

$initial = strtoupper(substr($adminUsername, 0, 1));

// Simpler navigation: every page is one tap away, grouped by what you are doing. (The old dropdown groups are gone.)
$leaf = [];
foreach ($navItems as $k => $it) {
    if (!empty($it['children'])) { foreach ($it['children'] as $ck => $c) $leaf[$ck] = $c; }
    else $leaf[$k] = $it;
}
// Five places for everyday work; the expert tools wait under "More tools" until you open it.
$navSections = [
    'Home'        => ['dashboard', 'manage-buildings', 'hazards'],
    'Campus map'  => ['campus-paths', 'building-outlines', 'campus-map'],
    'Your school' => ['settings', 'account'],
    'More tools'  => ['enrollment-steps', 'doors', 'test-chat', 'data-pack'],
];
// The expert pages, grouped by what they are for.
$moreGroups = [
    'Building setup'      => ['doors', 'enrollment-steps'],
    'Assistant and data'  => ['test-chat', 'data-pack'],
];
require_once __DIR__ . '/../../../Backend/institution.php';
// Pages of features this school switched off are left out of the menu.
$off = array_filter(['hazards' => !inst_feature('hazards'), 'enrollment-steps' => !inst_feature('enrollment'), 'test-chat' => !inst_feature('chat')]);
foreach ($navSections as $sn => $ks) $navSections[$sn] = array_values(array_diff($ks, array_keys($off)));
$navSections = array_filter($navSections);   // a section with nothing left disappears
// A PSMO account sees only the areas an administrator gave it (Account > Team).
$isPsmo = lampara_admin_role() === 'psmo';
if ($isPsmo) {
    $byArea = ['buildings' => ['manage-buildings'], 'campus' => ['campus-paths', 'building-outlines', 'campus-map'], 'reports' => ['hazards'], 'enrollment' => ['enrollment-steps'], 'assistant' => ['test-chat']];
    $mine = [];
    foreach ($byArea as $area => $keys) if (lampara_admin_can($area)) foreach ($keys as $k) if (!isset($off[$k])) $mine[] = $k;
    $navSections = array_filter(['Your work' => $mine, 'Your school' => ['account']]);
}
// The three tabs along the bottom of a phone, and which pages count as "inside" each one.
$tabs = [
    ['label' => 'Home',      'href' => 'dashboard.php',      'icon' => $leaf['dashboard']['icon'],        'match' => ['dashboard']],
    ['label' => 'Buildings', 'href' => 'buildings.php',      'icon' => $leaf['manage-buildings']['icon'], 'match' => ['manage-buildings', 'doors', 'test-chat']],
    ['label' => 'Campus',    'href' => 'campus-paths.php',   'icon' => $leaf['campus-paths']['icon'],     'match' => ['campus-paths', 'building-outlines', 'campus-map']],
];
if ($isPsmo) $tabs = array_values(array_filter($tabs, function ($t) { return in_array($t['href'], [lampara_psmo_home(), 'buildings.php'], true) && ($t['href'] !== 'buildings.php' || lampara_admin_can('buildings')); })) ?: [$tabs[1]];

// Pages reached from another page (the chat preview opens from the Buildings list menu) light that page's entry.
$parentOf = ['test-chat' => 'manage-buildings'];
$litKey = $parentOf[$activeNav] ?? $activeNav;

// Header title: the active page, with its section as a small lead-in.
$headerGroup = '';
$headerTitle = 'Admin';
foreach ($navSections as $sectionName => $keys) {
    if (in_array($litKey, $keys, true)) {
        $headerGroup = $sectionName;
        $headerTitle = $leaf[$activeNav]['label'];
    }
}
?>
<link rel="stylesheet" href="../../assets/css/tw.css?v=<?= filemtime(__DIR__ . '/../../assets/css/tw.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-ux.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-ux.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-v2.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-v2.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/admin-mobile.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-mobile.css') ?>">
<script defer src="../../Js/Include/admin-ux.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-ux.js') ?>"></script>
<script>try { var __t = localStorage.getItem('lampara_admin_theme'); if (__t === 'dark' || (!__t && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.setAttribute('data-admin-theme', 'dark'); } catch (e) { /* storage blocked: light */ }</script>
<link rel="stylesheet" href="../../Css/Admin/admin-dark.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/admin-dark.css') ?>">
<script>try { if (localStorage.getItem('lampara_admin_sidebar') === '1') document.documentElement.classList.add('sb-collapsed'); } catch (e) { /* storage blocked: stays open */ }</script>
<a href="#adminMain" class="skip-link">Skip to main content</a>
<div class="admin-topbar">
  <div class="admin-topbar-row">
    <button type="button" class="sidebar-toggle" data-sidebar-open aria-label="Open menu" aria-expanded="false" aria-controls="adminSidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <a href="dashboard.php" class="admin-brand">
      <span class="brand-mark">
        <img src="../../assets/logo.svg" alt="" width="17" height="17" style="display:block">
      </span>
      Admin
    </a>
    <button type="button" class="admin-header-btn theme-toggle theme-toggle-m" data-admin-theme-toggle aria-label="Switch to dark mode" aria-pressed="false" title="Dark mode"><svg class="ico-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg><svg class="ico-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg></button>
    <button type="button" class="admin-search-icon" data-admin-search aria-label="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button>
  </div>
</div>

<header class="admin-header" role="banner">
  <div class="admin-header-title">
    <span class="admin-header-bar" aria-hidden="true"></span>
    <div>
      <nav class="admin-crumb" aria-label="Breadcrumb">
        <span class="crumb-item"><?= htmlspecialchars($headerGroup !== '' ? $headerGroup : 'Admin') ?></span>
        <span class="crumb-sep" aria-hidden="true">&rsaquo;</span>
        <strong class="crumb-current" aria-current="page"><?= htmlspecialchars($headerTitle) ?></strong>
      </nav>
    </div>
  </div>
  <div class="admin-header-actions">
    <button type="button" class="admin-search-btn" data-admin-search aria-label="Search pages, buildings and rooms (Ctrl K)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <span>Search</span><kbd>Ctrl K</kbd>
    </button>
    <button type="button" class="admin-header-btn theme-toggle" data-admin-theme-toggle aria-label="Switch to dark mode" aria-pressed="false" title="Dark mode"><svg class="ico-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg><svg class="ico-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg></button>
    <a class="admin-header-btn" href="../Public/index.php" target="_blank" rel="noopener" title="Open the student site" aria-label="Open the student site">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
    </a>
  </div>
</header>

<div class="sidebar-backdrop" data-sidebar-backdrop></div>

<aside class="admin-sidebar" id="adminSidebar" aria-label="Admin navigation">
  <div class="sidebar-brand">
    <span class="brand-mark">
      <img src="../../assets/logo.svg" alt="" width="20" height="20" style="display:block">
    </span>
    <span class="brand-text">
      <span class="brand-name">Lampara</span><br>
      <span class="brand-sub">Admin Panel</span>
    </span>
    <button type="button" class="sidebar-collapse" data-sidebar-collapse aria-label="Collapse the sidebar" aria-expanded="true" title="Collapse the sidebar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
    </button>
    <button type="button" class="sidebar-close" data-sidebar-close aria-label="Close menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>

  <nav aria-label="Admin sections" class="nav-sections">
    <?php
    $linkHtml = function ($key) use ($leaf, $litKey) { $item = $leaf[$key]; ob_start(); ?>
          <a href="<?= htmlspecialchars($item['href']) ?>" class="<?= $litKey === $key ? 'is-active' : '' ?>" title="<?= htmlspecialchars($item['label']) ?>"<?= $litKey === $key ? ' aria-current="page"' : '' ?>>
            <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><?= $item['icon'] ?></svg></span>
            <span class="nav-label"><?= htmlspecialchars($item['label']) ?></span>
            <?php if ($litKey === $key): ?><span class="nav-here"><span class="sr-only">Current page</span></span><?php endif; ?>
          </a>
    <?php return ob_get_clean(); };
    foreach ($navSections as $sectionName => $keys):
      if ($sectionName === 'More tools'):
        $open = in_array($litKey, $keys, true); ?>
      <details class="nav-section nav-more"<?= $open ? ' open' : '' ?>>
        <summary class="nav-section-label"><?= htmlspecialchars($sectionName) ?></summary>
        <?php foreach ($moreGroups as $gName => $gKeys): $gKeys = array_values(array_intersect($gKeys, $keys)); if (!$gKeys) continue; ?>
          <details class="nav-group"<?= in_array($litKey, $gKeys, true) ? ' open' : '' ?>>
            <summary><?= htmlspecialchars($gName) ?></summary>
            <?php foreach ($gKeys as $key) echo $linkHtml($key); ?>
          </details>
        <?php endforeach; ?>
      </details>
    <?php else: ?>
      <div class="nav-section">
        <div class="nav-section-label"><?= htmlspecialchars($sectionName) ?></div>
        <?php foreach ($keys as $key) echo $linkHtml($key); ?>
      </div>
    <?php endif; endforeach; ?>
  </nav>

  <div class="sidebar-footer">
    <div class="sidebar-profile">
      <div class="profile-avatar"><?= htmlspecialchars($initial) ?></div>
      <div class="profile-text" style="min-width:0;">
        <div class="profile-name"><?= htmlspecialchars($adminUsername) ?></div>
        <div class="profile-role"><?= $isPsmo ? 'PSMO staff' : 'Administrator' ?></div>
      </div>
    </div>
    <a href="logout.php" class="admin-logout"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="logout-label">Logout</span></a>
  </div>
</aside>

<!-- Phone navigation: the three places you go most, and More for everything else (opens the same menu). -->
<nav class="admin-tabs" aria-label="Main">
  <?php foreach ($tabs as $tab): $on = in_array($activeNav, $tab['match'], true); ?>
    <a href="<?= htmlspecialchars($tab['href']) ?>" class="<?= $on ? 'is-active' : '' ?>"<?= $on ? ' aria-current="page"' : '' ?>>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><?= $tab['icon'] ?></svg>
      <span><?= htmlspecialchars($tab['label']) ?></span>
    </a>
  <?php endforeach; ?>
  <button type="button" data-sidebar-open aria-label="More: all pages and log out" aria-expanded="false" aria-controls="adminSidebar">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
    <span>More</span>
  </button>
</nav>

<?php $adminOfflineVer = filemtime(__DIR__ . '/../../Js/Include/admin-offline.js'); ?>
<!-- Offline support for the whole admin panel: pending changes, sync prompt, service worker. -->
<script src="../../Js/Include/admin-offline.js?v=<?= $adminOfflineVer ?>"></script>
<script src="../../Js/Include/admin-savestate.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-savestate.js') ?>"></script>
<script src="../../Js/Include/admin-toast.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-toast.js') ?>"></script>
<script src="../../Js/Include/admin-search.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-search.js') ?>"></script>
<script src="../../Js/Include/dropzone.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/dropzone.js') ?>"></script>
<script src="../../Js/Include/admin-nav.js"></script>
<script src="../../Js/Include/admin-theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-theme.js') ?>"></script>
<script src="../../Js/Include/admin-dropdown.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-dropdown.js') ?>"></script>
<script src="../../Js/Include/read-more.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/read-more.js') ?>"></script>
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>" data-admin="1"></script>

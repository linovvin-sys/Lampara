<?php
// Shared admin nav — include after setting $activeNav (one of the keys below).
// Renders a hamburger-triggered off-canvas drawer on mobile and a static
// sidebar with icons + a profile card on desktop (see Frontend/Css/Admin/admin.css
// for the breakpoint and drawer/sidebar styles, and Frontend/Js/Include/admin-nav.js
// for the open/close behavior).

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$adminUsername = $_SESSION['admin_username'] ?? 'Admin';

$navItems = [
    'dashboard' => [
        'label' => 'Dashboard',
        'href'  => 'dashboard.php',
        'icon'  => '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    ],
    // Dropdown: the campus-wide map content (walkways and the static campus map).
    'campus-editor' => [
        'label' => 'Campus Editor',
        'icon'  => '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/>',
        'children' => [
            'campus-paths' => [
                'label' => 'Campus Paths',
                'href'  => 'campus-paths.php',
                'icon'  => '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17c4-1 2-6 5-8s3-2 3-2"/>',
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
                'label' => 'Buildings',
                'href'  => 'buildings.php',
                'icon'  => '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/>',
            ],
            'floor-calibration' => [
                'label' => 'Floor Calibration',
                'href'  => 'floor-calibration.php',
                'icon'  => '<path d="M4 20 20 4M4 20h6M4 20v-6M9 9l2 2M13 5l2 2M5 13l2 2"/>',
            ],
        ],
    ],
    'test-chat' => [
        'label' => 'Test Chat',
        'href'  => 'test-chat.php',
        'icon'  => '<path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/>',
    ],
];

$initial = strtoupper(substr($adminUsername, 0, 1));

// Header title: the active page, with its dropdown group (if any) as a small lead-in.
$headerGroup = '';
$headerTitle = 'Admin';
foreach ($navItems as $key => $item) {
    if (!empty($item['children']) && isset($item['children'][$activeNav])) {
        $headerGroup = $item['label'];
        $headerTitle = $item['children'][$activeNav]['label'];
    } elseif ($key === $activeNav) {
        $headerTitle = $item['label'];
    }
}
?>
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
    <a href="logout.php" class="admin-logout" style="margin-left:auto;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Logout</a>
  </div>
</div>

<header class="admin-header" role="banner">
  <div class="admin-header-title">
    <span class="admin-header-bar" aria-hidden="true"></span>
    <div>
      <?php if ($headerGroup !== ''): ?><div class="admin-header-group"><?= htmlspecialchars($headerGroup) ?></div><?php endif; ?>
      <div class="admin-header-page"><?= htmlspecialchars($headerTitle) ?></div>
    </div>
  </div>
  <div class="admin-header-actions">
    <a class="admin-header-btn" href="../Public/index.php" target="_blank" rel="noopener" title="Open the student site" aria-label="Open the student site">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
    </a>
    <div class="admin-header-user">
      <span class="admin-header-avatar"><?= htmlspecialchars($initial) ?></span>
      <span class="admin-header-name"><?= htmlspecialchars($adminUsername) ?></span>
    </div>
  </div>
</header>

<div class="sidebar-backdrop" data-sidebar-backdrop></div>

<aside class="admin-sidebar" id="adminSidebar">
  <div class="sidebar-brand">
    <span class="brand-mark">
      <img src="../../assets/logo.svg" alt="" width="20" height="20" style="display:block">
    </span>
    <span class="brand-text">
      <span class="brand-name">Lampara</span><br>
      <span class="brand-sub">Admin Panel</span>
    </span>
    <button type="button" class="sidebar-close" data-sidebar-close aria-label="Close menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  </div>

  <div class="sidebar-label">Menu</div>
  <nav>
    <?php foreach ($navItems as $key => $item): ?>
      <?php if (!empty($item['children'])): ?>
        <?php $groupActive = array_key_exists($activeNav, $item['children']); ?>
        <div class="nav-group<?= $groupActive ? ' is-open has-active' : '' ?>" data-nav-group="<?= htmlspecialchars($key) ?>">
          <button type="button" class="nav-group-toggle" aria-expanded="<?= $groupActive ? 'true' : 'false' ?>" aria-controls="navSub-<?= htmlspecialchars($key) ?>">
            <span class="nav-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><?= $item['icon'] ?></svg></span>
            <span class="nav-group-label"><?= htmlspecialchars($item['label']) ?></span>
            <svg class="nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="nav-sub" id="navSub-<?= htmlspecialchars($key) ?>">
            <div class="nav-sub-inner">
              <?php foreach ($item['children'] as $ckey => $child): ?>
                <a href="<?= htmlspecialchars($child['href']) ?>" class="<?= $activeNav === $ckey ? 'is-active' : '' ?>">
                  <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><?= $child['icon'] ?></svg></span>
                  <?= htmlspecialchars($child['label']) ?>
                </a>
              <?php endforeach; ?>
            </div>
          </div>
        </div>
      <?php else: ?>
        <a href="<?= htmlspecialchars($item['href']) ?>" class="<?= $activeNav === $key ? 'is-active' : '' ?>">
          <span class="nav-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><?= $item['icon'] ?></svg></span>
          <?= htmlspecialchars($item['label']) ?>
        </a>
      <?php endif; ?>
    <?php endforeach; ?>
  </nav>

  <div class="sidebar-footer">
    <div class="sidebar-profile">
      <div class="profile-avatar"><?= htmlspecialchars($initial) ?></div>
      <div style="min-width:0;">
        <div class="profile-name"><?= htmlspecialchars($adminUsername) ?></div>
        <div class="profile-role">Administrator</div>
      </div>
    </div>
    <a href="logout.php" class="admin-logout"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Logout</a>
  </div>
</aside>

<?php $adminOfflineVer = filemtime(__DIR__ . '/../../Js/Include/admin-offline.js'); ?>
<!-- Offline support for the whole admin panel: pending changes, sync prompt, service worker. -->
<script src="../../Js/Include/admin-offline.js?v=<?= $adminOfflineVer ?>"></script>
<script src="../../Js/Include/admin-nav.js"></script>

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
    'manage-buildings' => [
        'label' => 'Manage Buildings',
        'href'  => 'manage-buildings.php',
        'icon'  => '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/>',
    ],
    'register-building' => [
        'label' => 'Register Building',
        'href'  => 'register-building.php',
        'icon'  => '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/>',
    ],
    'register-room' => [
        'label' => 'Register Room',
        'href'  => 'register-room.php',
        'icon'  => '<path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/>',
    ],
    'test-chat' => [
        'label' => 'Test Chat',
        'href'  => 'test-chat.php',
        'icon'  => '<path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"/>',
    ],
];

$initial = strtoupper(substr($adminUsername, 0, 1));
?>
<div class="admin-topbar">
  <div class="admin-topbar-row">
    <button type="button" class="sidebar-toggle" data-sidebar-open aria-label="Open menu" aria-expanded="false" aria-controls="adminSidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <a href="dashboard.php" class="admin-brand">
      <span class="brand-mark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
      </span>
      Admin
    </a>
    <a href="logout.php" class="admin-logout" style="margin-left:auto;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Logout</a>
  </div>
</div>

<div class="sidebar-backdrop" data-sidebar-backdrop></div>

<aside class="admin-sidebar" id="adminSidebar">
  <div class="sidebar-brand">
    <span class="brand-mark">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
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
      <a href="<?= htmlspecialchars($item['href']) ?>" class="<?= $activeNav === $key ? 'is-active' : '' ?>">
        <span class="nav-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><?= $item['icon'] ?></svg></span>
        <?= htmlspecialchars($item['label']) ?>
      </a>
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

<script src="../../Js/Include/admin-nav.js"></script>

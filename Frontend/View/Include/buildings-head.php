<?php
// Shared <head> for the building workspace pages. Set before including:
//   $pageTitle  - text after "Admin · "
//   $needsMap   - true when the page uses Leaflet / QR codes (the two editors)
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$editorToolsVer = filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css');
$buildingsCssVer = filemtime(__DIR__ . '/../../Css/Admin/buildings.css');
$needsMap = $needsMap ?? false;
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · <?= htmlspecialchars($pageTitle) ?></title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/manage-buildings.css">
<link rel="stylesheet" href="../../Css/Admin/register-building.css">
<link rel="stylesheet" href="../../Css/Admin/register-room.css">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= $editorToolsVer ?>">
<link rel="stylesheet" href="../../Css/Admin/buildings.css?v=<?= $buildingsCssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/utilities.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/utilities.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/design-pass.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/design-pass.css') ?>">
<?php if ($needsMap): ?>
<link rel="stylesheet" href="../../assets/vendor/leaflet/leaflet.css">
<?php endif; ?>
<script src="../../assets/vendor/vue.global.prod.js"></script>
<?php if ($needsMap): ?>
<script src="../../assets/vendor/leaflet/leaflet.js"></script>
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<?php endif; ?>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
<?php if ($needsMap): ?>
<script src="../../assets/vendor/qrcodejs/qrcode.min.js"></script>
<?php endif; ?>
</head>

<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/privacy.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Terms of use</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Student/privacy.css?v=<?= $pageCssVer ?>">
</head>
<body>
<main class="pv">
  <button type="button" class="pv-back" id="back">&larr; Back</button>
  <h1>Terms of use</h1>
  <p class="pv-lead">These are the simple rules for using Lampara, the campus guide of the school. By using the app you agree to them. They are short on purpose. How your information is handled is on the <a href="privacy.php">privacy page</a>.</p>

  <section>
    <h2>What Lampara is for</h2>
    <p>Lampara helps students, visitors and staff find buildings, rooms and offices on the campus. Use it for that, and for telling the school about a closed building or a blocked path.</p>
  </section>

  <section>
    <h2>Directions can be wrong</h2>
    <ul>
      <li>Maps, paths, floor plans, room details and hours can be out of date or off by a few meters. GPS and the compass are not exact, especially next to buildings and indoors.</li>
      <li>The AI answers only from the school's records and can still make mistakes. Check important things, such as an office's hours, with the office.</li>
      <li>Look where you are walking. Do not use the camera guide while crossing a road or on stairs. Pay attention to signs, barriers and the school's staff. If they say something different from the app, follow them.</li>
    </ul>
  </section>

  <section>
    <h2>Sending reports</h2>
    <ul>
      <li>Report only what is true and what you saw yourself: a closed building or a blocked path.</li>
      <li>Photograph the place, not people. Never send photos that are indecent, violent, hateful, or that show someone who did not agree to it.</li>
      <li>Do not send false, repeated or joke reports, and do not mark a report urgent unless there is real danger. Urgent is for danger, not for inconvenience.</li>
      <li>Reports are checked by the school staff, and photos are also checked by software. A report can be refused, hidden or deleted. A phone that keeps sending reports the staff reject can lose the right to send them.</li>
      <li>You are responsible for what you send. By sending a photo or a note you allow the school to show it to people using Lampara, and to keep it until the staff remove it.</li>
    </ul>
  </section>

  <section>
    <h2>Fair use</h2>
    <p>Do not try to break, overload or get around the app, its limits, the campus-only check or the staff's pages, and do not use it to collect other people's information. The staff pages are for school staff with an account. Misuse may be reported to the school.</p>
  </section>

  <section>
    <h2>No guarantees</h2>
    <p>The app is provided as it is, free, for the school's community. It may be unavailable, change, or stop working with no notice, and it works offline only with what your phone saved earlier. The school is not responsible for loss or harm that comes from relying on it, to the extent the law allows.</p>
  </section>

  <section>
    <h2>Changes and questions</h2>
    <p>The school may change these terms, and the date below will change with them. Questions, or a report or photo to remove: ask the Office of Student Affairs, Main Building, Room 1101.</p>
  </section>

  <p class="pv-small">Last updated 14 October 2026. These terms do not replace the school's own rules or policies, which apply as well.</p>
</main>
<script>
document.getElementById('back').onclick = function () { if (history.length > 1) history.back(); else location.href = 'where.php'; };
</script>
</body>
</html>

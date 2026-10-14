<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/privacy.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Privacy</title>
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
  <h1>How Lampara uses your phone</h1>
  <p class="pv-lead">Lampara helps you find your way around the campus. This page explains, in plain words, what it uses and what happens to it. You do not need an account, and nobody asks for your name.</p>

  <section>
    <h2>What the app asks your phone for</h2>
    <dl>
      <dt>Location</dt>
      <dd>To show where you are on the map and to check that you are on the campus. Your position stays on your phone. It is not sent to us or shown to other visitors while you walk.</dd>
      <dt>Camera</dt>
      <dd>To show the path over what you see, to read a room sign, and to take a photo for a report. The picture from the camera is not recorded while you walk.</dd>
      <dt>Motion and compass</dt>
      <dd>To know which way you are facing and to count your steps indoors. This also stays on your phone.</dd>
    </dl>
  </section>

  <section>
    <h2>What is sent to the school's server</h2>
    <ul>
      <li><b>A report you send.</b> The photo, the place (the building you chose and your position when you sent it), your note, and the time. After the staff confirm it, everyone using Lampara can see it, including the photo. A report is removed from view after 12 hours, and cleared reports are deleted after 30 days.</li>
      <li><b>Questions to Ask Lampara and room-sign photos.</b> The text of your question, or the photo of the sign, is sent to Google's Gemini service to read the sign or write an answer. Do not type personal details into the chat.</li>
    </ul>
  </section>

  <section>
    <h2>What stays only on your phone</h2>
    <p>Your recent searches, your trip in progress, the building list for offline use, and your settings (voice, mini-map). You can clear them by clearing this site's data in your browser.</p>
  </section>

  <section>
    <h2>When you send a report</h2>
    <ul>
      <li>Take a photo of the building or the path only. Please do not include people's faces, and do not photograph anyone without their permission.</li>
      <li>Photos are cleaned of the location and camera details your phone adds to them before they are saved.</li>
      <li>If a photo should not be on the screen, tap <b>Report this photo</b> under it. Three notices take it off everyone's screen until staff look at it.</li>
    </ul>
  </section>

  <section>
    <h2>Questions, or a photo to remove</h2>
    <p>Ask the Office of Student Affairs, Main Building, Room 1101, and say what the photo shows and roughly when it was sent. The staff can delete a report and its photo.</p>
  </section>

  <p class="pv-small">This page explains how the app works. The school may add its own privacy policy, and parents or guardians of students under 18 should read it with them.</p>
</main>
<script>
document.getElementById('back').onclick = function () { if (history.length > 1) history.back(); else location.href = 'where.php'; };
</script>
</body>
</html>

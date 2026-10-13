<?php

// Copy this file to `secrets.php` (same folder) and put your real key there.
// `secrets.php` is in .gitignore — it will never get committed. This example
// file IS committed, so anyone cloning the repo knows what to create.

// Get a free key at https://aistudio.google.com/apikey
define('GEMINI_API_KEY', 'paste-your-real-key-here');

// Optional: an address that gets an email for every new visitor report (and "[URGENT]" in the subject for urgent ones).
// Needs the server to be able to send mail (PHP mail()). Leave it out to rely on the admin panel alone.
// define('HAZARD_ALERT_EMAIL', 'duty-officer@example.edu');

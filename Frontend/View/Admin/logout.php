<?php
require_once __DIR__ . '/../../../Backend/session_boot.php';
lampara_session_start();
$_SESSION = [];
session_destroy();
header('Location: login.php');
exit;

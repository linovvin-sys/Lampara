<?php

// Lampara — DB connection. Same pattern as SIAdrafts/Backend/db.php, kept
// self-contained here so this starter has zero dependency on that project.

// Basic response headers for every API: the browser must not guess file types, and sends the least it can as a referrer.
if (PHP_SAPI !== 'cli' && !headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
}

class DbError extends RuntimeException {}

class Database
{
    private string $host = 'localhost';
    private string $username = 'root';
    private string $password = '';
    private string $database = 'lampara_db';
    private int $port = 3306; // fallback default (XAMPP) if no per-machine config/db.php exists

    public $conn;

    public function __construct()
    {
        // Each teammate's actual DB settings (host/port/password differ between
        // MAMP and XAMPP) live in config/db.php — gitignored, never shared, so
        // pulling a teammate's changes never overwrites your own local setup.
        // See config/db.example.php for the template.
        $localConfigPath = __DIR__ . '/db.php';
        if (file_exists($localConfigPath)) {
            $overrides = require $localConfigPath;
            $this->host = $overrides['host'] ?? $this->host;
            $this->username = $overrides['username'] ?? $this->username;
            $this->password = $overrides['password'] ?? $this->password;
            $this->database = $overrides['database'] ?? $this->database;
            $this->port = $overrides['port'] ?? $this->port;
        }
    }

    public function connect()
    {
        // The built-in fallback (the database owner "root" with no password) is for a laptop only. Anywhere else, db.php must name
        // a database user that can touch lampara_db and nothing more (see Backend/db.example.php).
        $local = in_array(strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? 'localhost')[0]), ['localhost', '127.0.0.1', '[::1]'], true) || PHP_SAPI === 'cli';
        if (!file_exists(__DIR__ . '/db.php') && $this->username === 'root' && $this->password === '' && !$local) {
            error_log('Lampara: refusing to connect as root with no password on a non-local host. Create Backend/db.php.');
            http_response_code(500);
            die('The server is not set up yet.');
        }
        $this->conn = new mysqli($this->host, $this->username, $this->password, $this->database, $this->port);

        if ($this->conn->connect_error) {
            error_log('Lampara database connection failed: ' . $this->conn->connect_error);   // the reason stays in the server log, not on the page
            http_response_code(500);
            die('The database is not available right now.');
        }

        $this->conn->set_charset("utf8mb4");
        return $this->conn;
    }

    public function close()
    {
        if ($this->conn) {
            $this->conn->close();
        }
    }
}

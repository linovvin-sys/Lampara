<?php

// Lampara — DB connection. Same pattern as SIAdrafts/Backend/db.php, kept
// self-contained here so this starter has zero dependency on that project.

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
        $this->conn = new mysqli($this->host, $this->username, $this->password, $this->database, $this->port);

        if ($this->conn->connect_error) {
            die("Database Connection Failed: " . $this->conn->connect_error .
                "\n\nDid you create the 'lampara_db' database and run schema.sql yet?");
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

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
    private int $port = 3306; // XAMPP's default MySQL port

    public $conn;

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

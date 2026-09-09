-- Lampara — schema (v2: structured rooms, matching the Figma-designed admin flow)
-- Run this once against a fresh `lampara_db` database (create it first in phpMyAdmin
-- or via: CREATE DATABASE lampara_db CHARACTER SET utf8mb4;)

CREATE TABLE IF NOT EXISTS buildings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    -- Legacy free-text field, kept for any building-level facts that don't
    -- belong to a specific room (general hours, campus-wide notes). Room-level
    -- facts now live in the `rooms` table below instead of being crammed here.
    directory TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Structured room registration — this is what signage scanning matches against
-- (an OCR'd "ROOM 204" looks up room_number directly) and what powers the
-- Manual Search / Nearby lists. Replaces cramming everything into one text blob.
CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT NOT NULL,
    room_number VARCHAR(30) NOT NULL,
    room_name VARCHAR(150) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    -- Office = has real operating hours. Classroom/Lab = no fixed hours;
    -- class scheduling is a deliberately separate scope (see project docs).
    room_type ENUM('office', 'classroom') NOT NULL DEFAULT 'office',
    hours VARCHAR(150) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "This seems outdated — report it" flag from the scan-result screen. A report
-- doesn't change the room record itself; it just surfaces to whoever maintains
-- the directory as a worklist, same discipline as the rest of this project.
CREATE TABLE IF NOT EXISTS outdated_flags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    note VARCHAR(255) NULL,
    resolved TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin accounts — gates the admin/ pages and any write (POST/PUT/DELETE) to the
-- buildings/rooms APIs. Public GETs (student-facing reads) stay open. Create your
-- own account with `php create-admin.php` from the command line — never hand a
-- password to anyone else to type in for you.
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed data — replace the building's lat/lng with a real, walked coordinate.
INSERT INTO buildings (name, lat, lng, directory) VALUES
('Amafel Building (NCST)', 14.328300, 120.937200, NULL);

SET @amafel_id = LAST_INSERT_ID();

INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, hours, notes) VALUES
(@amafel_id, '201', 'Registrar', '1st Floor', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '204', 'Treasury', '2nd Floor', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '105', 'OSA (Student Affairs)', '1st Floor', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '301', 'Physics Lecture Hall', '3rd Floor', 'classroom', NULL, '3rd floor, past the stairwell'),
(@amafel_id, '302', 'Chemistry Lab', '3rd Floor', 'classroom', NULL, NULL);

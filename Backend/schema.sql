-- Lampara — schema (v2: structured rooms, matching the Figma-designed admin flow)
-- Run this once against a fresh `lampara_db` database (create it first in phpMyAdmin
-- or via: CREATE DATABASE lampara_db CHARACTER SET utf8mb4;)
--
-- Already have a database from before floor_count existed (e.g. your local
-- MAMP db, or one already uploaded to InfinityFree)? Don't re-run this whole
-- file — just run this one line against it instead:
--   ALTER TABLE buildings ADD COLUMN floor_count INT NOT NULL DEFAULT 1 AFTER lng;
--   ALTER TABLE buildings ADD COLUMN building_number INT NULL AFTER floor_count;
--   ALTER TABLE rooms ADD UNIQUE KEY room_number_unique (room_number);
--   ALTER TABLE rooms MODIFY room_number VARCHAR(30) NULL;
--   ALTER TABLE rooms ADD COLUMN category ENUM('office','classroom','cr','canteen') NOT NULL DEFAULT 'office' AFTER room_type;
--   UPDATE rooms SET category = room_type; -- backfill existing rows before this column existed

CREATE TABLE IF NOT EXISTS buildings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    -- Drives the floor dropdown on Register Room — rooms can only be filed
    -- under a floor that actually exists in this building.
    floor_count INT NOT NULL DEFAULT 1,
    -- The school's room-numbering scheme encodes this as the first digit of
    -- every room number (e.g. "1101" = building 1, floor 1, room 01) — NULL
    -- for buildings with no numbered rooms (e.g. the Gymnasium).
    building_number INT NULL,
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
    -- Globally unique, not just per-building — signage scanning and
    -- destination search both look this up with no building filter, so a
    -- duplicate number across buildings would resolve to an arbitrary row.
    -- NULLable on purpose: some real spaces (comfort rooms, stairwells)
    -- have no number and no signage at all — giving them a fake in-scheme
    -- number to shoehorn them into this column would be actively wrong,
    -- since the whole point of room_number is that it maps to something a
    -- camera can actually read on a real door. MySQL allows multiple NULLs
    -- under a UNIQUE constraint, so several unnumbered rooms coexist fine.
    room_number VARCHAR(30) NULL UNIQUE,
    room_name VARCHAR(150) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    -- Office = has real operating hours. Classroom/Lab = no fixed hours;
    -- class scheduling is a deliberately separate scope (see project docs).
    -- Purely an internal "does this have fixed hours" flag now — `category`
    -- below is the human-facing distinction (a CR/canteen isn't an office
    -- or a classroom, it's just derived to whichever of these two matches
    -- its hours behavior).
    room_type ENUM('office', 'classroom') NOT NULL DEFAULT 'office',
    -- What this actually IS, named plainly — answers "why is a CR
    -- registered here" directly instead of overloading room_type/office
    -- semantics onto something that isn't really an office. A second table
    -- for amenities would just duplicate every feature (search, directions,
    -- chat grounding) that a CR needs exactly as much as an office does.
    category ENUM('office', 'classroom', 'cr', 'canteen') NOT NULL DEFAULT 'office',
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
INSERT INTO buildings (name, lat, lng, floor_count, building_number, directory) VALUES
('Amafel Building (NCST)', 14.328300, 120.937200, 4, 1, NULL);

SET @amafel_id = LAST_INSERT_ID();

INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes) VALUES
(@amafel_id, '201', 'Registrar', '1st Floor', 'office', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '204', 'Treasury', '2nd Floor', 'office', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '105', 'OSA (Student Affairs)', '1st Floor', 'office', 'office', '8:00 AM – 5:00 PM, Mon–Fri', NULL),
(@amafel_id, '301', 'Physics Lecture Hall', '3rd Floor', 'classroom', 'classroom', NULL, '3rd floor, past the stairwell'),
(@amafel_id, '302', 'Chemistry Lab', '3rd Floor', 'classroom', 'classroom', NULL, NULL);

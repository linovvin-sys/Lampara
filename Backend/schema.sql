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
--   ALTER TABLE rooms ADD COLUMN map_x DECIMAL(5,2) NULL, ADD COLUMN map_y DECIMAL(5,2) NULL;
--   CREATE TABLE floor_plans (id INT AUTO_INCREMENT PRIMARY KEY, building_id INT NOT NULL, floor VARCHAR(50) NOT NULL, image_path VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY building_floor (building_id, floor), FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   CREATE TABLE floor_plan_nodes (id INT AUTO_INCREMENT PRIMARY KEY, floor_plan_id INT NOT NULL, x DECIMAL(5,2) NOT NULL, y DECIMAL(5,2) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   CREATE TABLE floor_plan_edges (id INT AUTO_INCREMENT PRIMARY KEY, node_a_id INT NOT NULL, node_b_id INT NOT NULL, FOREIGN KEY (node_a_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE, FOREIGN KEY (node_b_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE, UNIQUE KEY edge_pair (node_a_id, node_b_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   ALTER TABLE rooms ADD COLUMN path_node_id INT NULL;
--   ALTER TABLE rooms ADD CONSTRAINT fk_rooms_path_node FOREIGN KEY (path_node_id) REFERENCES floor_plan_nodes(id) ON DELETE SET NULL;
--   ALTER TABLE floor_plans ADD COLUMN north_offset DECIMAL(6,2) NULL, ADD COLUMN meters_per_unit_x DECIMAL(8,4) NULL, ADD COLUMN meters_per_unit_y DECIMAL(8,4) NULL;
--   ALTER TABLE campus_nodes ADD COLUMN name VARCHAR(40) NULL; ALTER TABLE floor_plan_nodes ADD COLUMN name VARCHAR(40) NULL;  then run: php Backend/scripts/name-points.php
--   CREATE TABLE sync_ops (op_id VARCHAR(64) PRIMARY KEY, result_json TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   CREATE TABLE sync_temp_ids (temp_id VARCHAR(64) PRIMARY KEY, entity VARCHAR(20) NOT NULL, real_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   CREATE TABLE campus_nodes (id INT AUTO_INCREMENT PRIMARY KEY, lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL, node_type ENUM('junction','gate','entrance') NOT NULL DEFAULT 'junction', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   CREATE TABLE campus_edges (id INT AUTO_INCREMENT PRIMARY KEY, node_a_id INT NOT NULL, node_b_id INT NOT NULL, FOREIGN KEY (node_a_id) REFERENCES campus_nodes(id) ON DELETE CASCADE, FOREIGN KEY (node_b_id) REFERENCES campus_nodes(id) ON DELETE CASCADE, UNIQUE KEY campus_edge_pair (node_a_id, node_b_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--   ALTER TABLE buildings ADD COLUMN entrance_node_id INT NULL;
--   ALTER TABLE buildings ADD CONSTRAINT fk_buildings_entrance_node FOREIGN KEY (entrance_node_id) REFERENCES campus_nodes(id) ON DELETE SET NULL;

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
    -- Percentage position (0-100) on that floor's plan image, not raw
    -- pixels — stays correct regardless of what size the image actually
    -- renders at on a given phone screen. NULL until an admin has placed
    -- the marker (or if that floor has no plan uploaded at all yet) — the
    -- scan result screen falls back to the plain text direction hint
    -- whenever either room is missing one, never breaks on incomplete data.
    map_x DECIMAL(5, 2) NULL,
    map_y DECIMAL(5, 2) NULL,
    -- Which walkable-path node (see floor_plan_nodes below) this room's
    -- doorway connects to — the entry point pathfinding routes to/from when
    -- drawing a turn-by-turn line between two rooms on the same floor. The
    -- FK is added after floor_plan_nodes exists further down this file.
    path_node_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One uploaded image per building+floor (evacuation plans, hand sketches —
-- doesn't need to be to-scale, just roughly right so relative positions
-- read correctly). Not every floor needs one; rooms on floors with no plan
-- just keep using the plain text direction hint.
CREATE TABLE IF NOT EXISTS floor_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT NOT NULL,
    floor VARCHAR(50) NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    -- Indoor AR calibration (set on the admin Floor Calibration page). Plan
    -- coordinates are percentages of the image, so to walk them in real meters
    -- the AR guide needs the real size of one plan unit on each axis, and which
    -- compass bearing "up" on the image points to. NULL = not calibrated yet,
    -- and the indoor AR button simply doesn't appear for that floor.
    north_offset DECIMAL(6, 2) NULL,
    meters_per_unit_x DECIMAL(8, 4) NULL,
    meters_per_unit_y DECIMAL(8, 4) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY building_floor (building_id, floor),
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Walkable-path graph for one floor plan — junction points an admin drops
-- along the corridors, connected into a network. Pathfinding (Dijkstra) runs
-- over this at request time to draw an actual route line between two rooms,
-- same idea as a mall directory kiosk. Small per floor, drawn once.
CREATE TABLE IF NOT EXISTS floor_plan_nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    floor_plan_id INT NOT NULL,
    x DECIMAL(5, 2) NOT NULL,
    y DECIMAL(5, 2) NOT NULL,
    -- "Point A", "Point B", ... unique within one floor plan (see Backend/point_names.php).
    name VARCHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- An undirected walkable connection between two nodes.
CREATE TABLE IF NOT EXISTS floor_plan_edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_a_id INT NOT NULL,
    node_b_id INT NOT NULL,
    FOREIGN KEY (node_a_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (node_b_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE,
    UNIQUE KEY edge_pair (node_a_id, node_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE rooms ADD CONSTRAINT fk_rooms_path_node
    FOREIGN KEY (path_node_id) REFERENCES floor_plan_nodes(id) ON DELETE SET NULL;

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

-- Outdoor walkway graph — points an admin drops on real campus walkways (GPS
-- coordinates, not floor-plan percentages), connected into a network. The AR
-- guide routes over this from the user's position to a building's entrance so
-- the ground arrow follows walkways instead of cutting through buildings.
CREATE TABLE IF NOT EXISTS campus_nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    node_type ENUM('junction','gate','entrance') NOT NULL DEFAULT 'junction',
    -- "Point A", "Point B", ... unique across all campus points (see Backend/point_names.php).
    name VARCHAR(40) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campus_edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    node_a_id INT NOT NULL,
    node_b_id INT NOT NULL,
    FOREIGN KEY (node_a_id) REFERENCES campus_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (node_b_id) REFERENCES campus_nodes(id) ON DELETE CASCADE,
    UNIQUE KEY campus_edge_pair (node_a_id, node_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The walkway node at a building's door — where the outdoor route ends.
ALTER TABLE buildings ADD COLUMN entrance_node_id INT NULL;
ALTER TABLE buildings ADD CONSTRAINT fk_buildings_entrance_node
    FOREIGN KEY (entrance_node_id) REFERENCES campus_nodes(id) ON DELETE SET NULL;

-- Offline sync bookkeeping for the admin panel (Backend/api/admin-sync.php).
-- sync_ops remembers every offline change already applied, so retrying a batch
-- after a dropped connection can never create duplicates. sync_temp_ids maps the
-- temporary ids the browser invents for things created offline ("t_ab12") to the
-- real ids they received, so later changes that reference them still resolve.
CREATE TABLE IF NOT EXISTS sync_ops (
    op_id VARCHAR(64) PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_temp_ids (
    temp_id VARCHAR(64) PRIMARY KEY,
    entity VARCHAR(20) NOT NULL,
    real_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The AR guide's starting anchor — scanned once, right before the student
-- starts walking, to fix the real starting position instead of guessing
-- from wherever the camera happens to be facing (indoor: no GPS at all;
-- outdoor: GPS exists but can still be a few meters off near buildings).
-- Exactly one of floor_plan_node_id / campus_node_id is set per row, and
-- there is at most one anchor per floor plan and at most one for the whole
-- outdoor campus graph — not one per node. `code` is a random public token,
-- not the raw node id, so a photographed/shared QR can't be used to
-- enumerate or guess other nodes.
CREATE TABLE IF NOT EXISTS qr_anchors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    floor_plan_node_id INT NULL,
    campus_node_id INT NULL,
    code VARCHAR(32) NOT NULL UNIQUE,
    label VARCHAR(80) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (floor_plan_node_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (campus_node_id) REFERENCES campus_nodes(id) ON DELETE CASCADE
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

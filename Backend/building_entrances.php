<?php

// Extra entrances: a building keeps its main entrance (buildings.entrance_node_id) and may have more, for example one on the street side
// and one on the campus side. Each is a walking-path point with a short label. The table is created the first time one is saved.

function ensure_extra_entrances_table(mysqli $conn): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $conn->query('CREATE TABLE IF NOT EXISTS building_entrances (
            building_id INT NOT NULL, node_id INT NOT NULL, label VARCHAR(40) NOT NULL DEFAULT "",
            PRIMARY KEY (building_id, node_id),
            FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
            FOREIGN KEY (node_id) REFERENCES campus_nodes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        return $ok = true;
    } catch (Throwable $e) { return $ok = false; }
}

// building id -> [ { node_id, label } ]. Empty when nothing was ever saved (the table may not exist yet).
function extra_entrances_by_building(mysqli $conn): array
{
    $out = [];
    try {
        $r = @$conn->query('SELECT building_id, node_id, label FROM building_entrances ORDER BY building_id, node_id');
        if ($r) while ($x = $r->fetch_assoc()) $out[(int) $x['building_id']][] = ['node_id' => (int) $x['node_id'], 'label' => $x['label']];
    } catch (Throwable $e) { /* no table yet */ }
    return $out;
}

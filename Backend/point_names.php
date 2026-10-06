<?php

// Names for walkway points: "Point A", "Point B", ... "Point Z", "Point AA", ...
//
// A name is stored with the point (campus_nodes.name / floor_plan_nodes.name), so a
// point keeps its name when another one is deleted. Names are unique inside one
// "scope": all outdoor campus points together, or all points on one floor plan.
// Unnamed (older) points get a name from the backfill script or, for a new point,
// automatically. Keep Frontend/Js/Include/point-names.js in step (same sequence).

const POINT_NAME_MAX = 40;

// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, ...
function point_label($index)
{
    $i = (int) $index;
    $s = '';
    do {
        $s = chr(65 + $i % 26) . $s;
        $i = intdiv($i, 26) - 1;
    } while ($i >= 0);
    return $s;
}

// Trim, collapse spaces, cap the length. '' when there is nothing usable.
function clean_point_name($value)
{
    $s = trim(preg_replace('/\s+/u', ' ', (string) $value));
    if (mb_strlen($s, 'UTF-8') > POINT_NAME_MAX) {
        $s = trim(mb_substr($s, 0, POINT_NAME_MAX, 'UTF-8'));
    }
    return $s;
}

// Lower-cased names already used in a scope. $scopeCol is null for campus points.
function point_names_in_scope($conn, $table, $scopeCol, $scopeId, $exceptId = 0)
{
    if ($scopeCol === null) {
        $stmt = $conn->prepare("SELECT name FROM $table WHERE name IS NOT NULL AND id <> ?");
        $stmt->bind_param('i', $exceptId);
    } else {
        $stmt = $conn->prepare("SELECT name FROM $table WHERE name IS NOT NULL AND id <> ? AND $scopeCol = ?");
        $stmt->bind_param('ii', $exceptId, $scopeId);
    }
    $stmt->execute();
    $res = $stmt->get_result();
    $used = [];
    while ($row = $res->fetch_row()) {
        $used[mb_strtolower($row[0], 'UTF-8')] = true;
    }
    $stmt->close();
    return $used;
}

function next_free_point_name(array $used)
{
    for ($i = 0; $i < 100000; $i++) {
        $candidate = 'Point ' . point_label($i);
        if (!isset($used[mb_strtolower($candidate, 'UTF-8')])) return $candidate;
    }
    return 'Point ' . uniqid();
}

// The name a NEW point should get: what was asked for if it is free, otherwise the
// next free "Point X". (Renaming uses point_name_is_free and refuses duplicates.)
function assign_point_name($conn, $table, $scopeCol, $scopeId, $desired)
{
    $used = point_names_in_scope($conn, $table, $scopeCol, $scopeId);
    $name = clean_point_name($desired);
    if ($name !== '' && !isset($used[mb_strtolower($name, 'UTF-8')])) return $name;
    return next_free_point_name($used);
}

function point_name_is_free($conn, $table, $scopeCol, $scopeId, $name, $exceptId)
{
    $used = point_names_in_scope($conn, $table, $scopeCol, $scopeId, $exceptId);
    return !isset($used[mb_strtolower($name, 'UTF-8')]);
}

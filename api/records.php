<?php
require_once __DIR__ . '/_ai_common.php';
ai_load_project_env(dirname(__DIR__));

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$file = ai_storage_directory() . DIRECTORY_SEPARATOR . ai_client_key() . '.json';
$now = time();
$stored = is_readable($file) ? json_decode(file_get_contents($file), true) : array();
if (!is_array($stored) || !isset($stored['expiresAt']) || (int) $stored['expiresAt'] <= $now) $stored = array('records' => array(), 'expiresAt' => null);

if ($method === 'GET') ai_json_response(200, $stored);
if ($method === 'DELETE') {
    if (is_file($file)) @unlink($file);
    ai_json_response(200, array('records' => array(), 'expiresAt' => null));
}
if ($method !== 'POST') ai_json_response(405, array('error' => 'Only GET, POST and DELETE are supported.'));

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body) || !isset($body['records']) || !is_array($body['records'])) ai_json_response(400, array('error' => 'A records array is required.'));
$records = array();
foreach (array_slice($body['records'], -120) as $record) {
    if (!is_array($record)) continue;
    $normalized = array(
        't' => (float) (isset($record['t']) ? $record['t'] : 0),
        'theta' => (float) (isset($record['theta']) ? $record['theta'] : 0),
        'omega' => (float) (isset($record['omega']) ? $record['omega'] : 0),
        'energy' => (float) (isset($record['energy']) ? $record['energy'] : 0),
        'id' => (int) (isset($record['id']) ? $record['id'] : 0),
        'cycle' => (int) (isset($record['cycle']) ? $record['cycle'] : 0)
    );
    if ($normalized['id'] > 0 && $normalized['cycle'] >= 0 && is_finite($normalized['t']) && is_finite($normalized['theta']) && is_finite($normalized['omega']) && is_finite($normalized['energy'])) $records[] = $normalized;
}
$stored = array('records' => $records, 'expiresAt' => $now + 3600);
$json = json_encode($stored, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (@file_put_contents($file, $json, LOCK_EX) === false) ai_json_response(503, array('error' => 'Unable to save experiment records on the server.'));
ai_json_response(200, $stored);

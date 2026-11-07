<?php

function ai_load_env_file($path) {
    if (!is_readable($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) return;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $position = strpos($line, '=');
        if ($position === false) continue;
        $name = trim(substr($line, 0, $position));
        $value = trim(substr($line, $position + 1));
        if (strlen($value) >= 2 && (($value[0] === '"' && substr($value, -1) === '"') || ($value[0] === "'" && substr($value, -1) === "'"))) $value = substr($value, 1, -1);
        if ($name !== '' && getenv($name) === false) putenv($name . '=' . $value);
    }
}

function ai_load_project_env($public_directory) {
    $directories = array($public_directory, dirname($public_directory));
    foreach ($directories as $directory) {
        ai_load_env_file($directory . DIRECTORY_SEPARATOR . '.env.local');
        ai_load_env_file($directory . DIRECTORY_SEPARATOR . '.env');
    }
}

function ai_env($name, $default = '') {
    $value = getenv($name);
    return $value === false ? $default : $value;
}

function ai_default_providers() {
    return array('https://api.urltime.cn');
}

function ai_default_models() {
    return array('deepseek-v4.1-flash');
}

function ai_parse_list($value, $fallback) {
    $items = preg_split('/[\r\n,]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY);
    $result = array();
    foreach ($items as $item) {
        $item = trim($item);
        if ($item !== '' && !in_array($item, $result, true)) $result[] = $item;
    }
    return count($result) > 0 ? $result : $fallback;
}

function ai_parse_providers($value, $fallback) {
    $matches = array();
    preg_match_all('~https?://[^\s,]+?(?=https?://|[\s,]|$)~i', (string) $value, $matches);
    $result = array();
    foreach ($matches[0] as $candidate) {
        $candidate = trim($candidate, " \t\r\n\0\x0B'\"");
        $parts = parse_url($candidate);
        if (!is_array($parts) || empty($parts['scheme']) || !in_array(strtolower($parts['scheme']), array('http', 'https'), true) || !empty($parts['user']) || !empty($parts['pass']) || empty($parts['host'])) continue;
        $provider = strtolower($parts['scheme']) . '://' . $parts['host'];
        if (!empty($parts['port'])) $provider .= ':' . (int) $parts['port'];
        if (!empty($parts['path']) && rtrim($parts['path'], '/') !== '') $provider .= rtrim($parts['path'], '/');
        if (!in_array($provider, $result, true)) $result[] = $provider;
    }
    return count($result) > 0 ? $result : $fallback;
}

function ai_providers() {
    return ai_parse_providers(ai_env('URLTIME_BASE_URLS', ai_env('URLTIME_BASE_URL', '')), ai_default_providers());
}

function ai_models() {
    return ai_parse_list(ai_env('URLTIME_MODELS', ''), ai_default_models());
}

function ai_round_robin_offset($path, $size) {
    if ($size < 1) return 0;
    $handle = @fopen($path, 'c+');
    if ($handle === false || !@flock($handle, LOCK_EX)) {
        if ($handle !== false) fclose($handle);
        return (int) floor(microtime(true) * 1000) % $size;
    }
    $current = trim(stream_get_contents($handle));
    $offset = ctype_digit($current) ? (int) $current : 0;
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, (string) (($offset + 1) % $size));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $offset % $size;
}

function ai_client_ip() {
    $remote = isset($_SERVER['REMOTE_ADDR']) ? trim($_SERVER['REMOTE_ADDR']) : '';
    $is_loopback_proxy = $remote === '127.0.0.1' || $remote === '::1';
    if (ai_env('TRUST_PROXY', '0') === '1' && $is_loopback_proxy) {
        $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']) : array();
        if (isset($_SERVER['HTTP_X_REAL_IP']) && trim($_SERVER['HTTP_X_REAL_IP']) !== '') return trim($_SERVER['HTTP_X_REAL_IP']);
        if (count($forwarded) > 0 && trim($forwarded[0]) !== '') return trim($forwarded[0]);
    }
    return $remote !== '' ? $remote : 'unknown';
}

function ai_client_key() {
    return hash('sha256', ai_env('RECORD_IP_SALT', 'physicalexam-records-v1') . ':' . ai_client_ip());
}

function ai_storage_directory() {
    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'records';
    if (!is_dir($directory)) @mkdir($directory, 0750, true);
    return $directory;
}

function ai_json_response($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

<?php
require_once __DIR__ . '/_ai_common.php';
ai_load_project_env(dirname(__DIR__));

function ai_sse_error($status, $message) {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache, no-transform');
        header('X-Accel-Buffering: no');
    }
    echo 'data: ' . json_encode(array('error' => array('message' => $message)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    echo "data: [DONE]\n\n";
    @ob_flush();
    flush();
    exit;
}

function ai_parse_http_status($headers) {
    if (!is_array($headers)) return 0;
    foreach ($headers as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) return (int) $matches[1];
    }
    return 0;
}

function ai_chat_endpoint($provider) {
    $provider = rtrim($provider, '/');
    return substr($provider, -3) === '/v1' ? $provider . '/chat/completions' : $provider . '/v1/chat/completions';
}

if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') ai_sse_error(405, '仅支持 POST 请求。');

$request = json_decode(file_get_contents('php://input'), true);
if (!is_array($request) || !isset($request['messages']) || !is_array($request['messages'])) ai_sse_error(400, '请求必须包含 messages 数组。');

$messages = array();
$total_length = 0;
foreach (array_slice($request['messages'], -14) as $message) {
    if (!is_array($message) || !isset($message['role']) || !isset($message['content'])) continue;
    $role = $message['role'];
    $content = trim((string) $message['content']);
    if (!in_array($role, array('system', 'user', 'assistant'), true) || $content === '') continue;
    $content = substr($content, 0, 6000);
    $total_length += strlen($content);
    if ($total_length > 24000) break;
    $messages[] = array('role' => $role, 'content' => $content);
}
if (count($messages) === 0) ai_sse_error(400, '没有可用的对话消息。');

$api_key = ai_env('URLTIME_API_KEY', '');
if ($api_key === '') ai_sse_error(503, '服务端未配置 URLTIME_API_KEY。');

$providers = ai_providers();
$models = ai_models();
$candidate_count = count($providers) * count($models);
if ($candidate_count < 1) ai_sse_error(503, '未配置可用的中转站或模型。');
$offset = ai_round_robin_offset(__DIR__ . DIRECTORY_SEPARATOR . 'ai-round-robin.txt', $candidate_count);
$route_timeout = (int) ai_env('AI_ROUTE_TIMEOUT', 12);
if ($route_timeout < 5 || $route_timeout > 60) $route_timeout = 12;
$total_timeout = (int) ai_env('AI_TOTAL_TIMEOUT', 60);
if ($total_timeout < 15 || $total_timeout > 180) $total_timeout = 60;
$deadline = microtime(true) + $total_timeout;

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-transform');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');
echo ": PHP AI stream connected\n\n";
@ob_flush();
flush();

$last_status = 0;
$last_timeout = false;
$authentication_failed = false;
for ($attempt = 0; $attempt < $candidate_count; $attempt++) {
    if (microtime(true) >= $deadline) {
        $last_timeout = true;
        break;
    }
    $attempt_timeout = min($route_timeout, max(1, (int) ceil($deadline - microtime(true))));
    $index = ($offset + $attempt) % $candidate_count;
    $provider = $providers[$index % count($providers)];
    $model = $models[(int) floor($index / count($providers))];
    $payload = json_encode(array(
        'model' => $model,
        'messages' => $messages,
        'stream' => true,
        'stream_options' => array('include_usage' => true),
        'temperature' => 0.6,
        'top_p' => 0.8
    ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $context = stream_context_create(array(
        'http' => array(
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer " . $api_key . "\r\nAccept: text/event-stream\r\n",
            'content' => $payload,
            'timeout' => $attempt_timeout,
            'ignore_errors' => true
        ),
        'ssl' => array('verify_peer' => true, 'verify_peer_name' => true)
    ));
    unset($http_response_header);
    $upstream = @fopen(ai_chat_endpoint($provider), 'r', false, $context);
    $status = ai_parse_http_status(isset($http_response_header) ? $http_response_header : array());
    $last_status = $status;
    if ($status !== 0) $last_timeout = false;
    if ($upstream === false || $status < 200 || $status >= 300) {
        if (is_resource($upstream)) fclose($upstream);
        if ($status === 401 || $status === 403) $authentication_failed = true;
        if ($status === 0) $last_timeout = true;
        continue;
    }
    stream_set_timeout($upstream, $attempt_timeout);
    $streamed = false;
    $timed_out = false;
    while (!feof($upstream)) {
        if (connection_aborted()) {
            fclose($upstream);
            exit;
        }
        $chunk = fread($upstream, 8192);
        if ($chunk === false) break;
        if ($chunk === '') {
            $metadata = stream_get_meta_data($upstream);
            if (!empty($metadata['timed_out'])) {
                $timed_out = true;
                break;
            }
            usleep(10000);
            continue;
        }
        $streamed = true;
        echo $chunk;
        @ob_flush();
        flush();
    }
    fclose($upstream);
    if ($streamed) exit;
    $last_timeout = $timed_out;
}

if ($authentication_failed || $last_status === 401 || $last_status === 403) ai_sse_error(502, '中转站密钥无效或没有所选模型的访问权限。');
if ($last_timeout) ai_sse_error(504, '中转站响应超时，请稍后重试。');
ai_sse_error(502, '所有中转站暂时不可用，请稍后重试。');

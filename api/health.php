<?php
require_once __DIR__ . '/_ai_common.php';
ai_load_project_env(dirname(__DIR__));
ai_json_response(200, array(
    'ok' => true,
    'configured' => ai_env('URLTIME_API_KEY', '') !== '',
    'records' => true,
    'providers' => count(ai_providers()),
    'models' => count(ai_models())
));

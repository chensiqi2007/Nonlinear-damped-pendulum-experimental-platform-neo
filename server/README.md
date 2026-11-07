# 1Panel 部署

1. 上传项目并执行 `npm ci`。
2. 创建 Node 项目，启动命令填写 `npm run start`，监听端口填写 `8080`。
3. 在环境变量中添加 `URLTIME_API_KEY` 和 `TRUST_PROXY=1`，不要把密钥写入前端或 `VITE_*` 变量；Node 端口应只允许本机反向代理访问。
4. 将静态站点指向 `dist`，将 `/api` 反向代理到 `http://127.0.0.1:8080`。
5. 用 `GET /health` 或 `GET /api/health` 检查服务状态；聊天接口为 `POST /api/chat`，响应采用 SSE 流式输出。实验记录接口为 `/api/records`，按客户端 IP 隔离并在最后一次更新后 1 小时自动删除。

开发时运行 `npm run dev`，Vite 会将 `/api` 转发到 `localhost:8080`。若在 1Panel/Nginx 中另加反向代理，请关闭 `/api` 的代理缓冲，避免增量内容被攒到请求结束后才显示。
## PHP / Kangle 部署

生产环境可不运行 Node：执行 `npm run build`，将 `dist/` 内容上传为 PHP 网站根目录，并保留其中的 `api/` 目录。在网站根目录放置未提交的 `.env`，配置 `URLTIME_API_KEY`、`URLTIME_BASE_URLS`、`URLTIME_MODELS`、`AI_ROUTE_TIMEOUT` 和 `AI_TOTAL_TIMEOUT`。确保 PHP 启用 OpenSSL、`allow_url_fopen`，并允许写入 `api/data/records/`；`.htaccess` 会把 `/api/chat`、`/api/health` 和 `/api/records` 重写到对应 PHP 接口。

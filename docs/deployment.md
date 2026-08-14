# 部署指南(Phase 2 互联网部署)

一个 Node 进程同时提供: 前端页面(client/dist 静态托管)+ WebSocket 合奏端点。
可选 TLS 证书即自动启用 WSS(wss://)。

## 1. 构建与本地单进程冒烟

```bash
npm install
npm run build        # 构建 client/dist(含 OSMD 谱面)
npm start            # 起 server: http(s)://0.0.0.0:8080,静态托管 + ws
```

浏览器打开 `http://<服务器IP>:8080`,默认 Server 字段已指向同源 `/ws`,直接创建房间即可。
局域网内其他设备访问同一地址即可合奏。

## 2. 局域网合奏

- 服务器所在机器 `npm start`
- 其他设备浏览器访问 `http://<服务器IP>:8080`
- 房主创建房间 → 把 6 位房间码发给队友 → 队友填码加入

> 注意: 浏览器要求音频必须在用户手势后启动;连接页的「创建房间/加入房间」按钮
> 已满足该要求。建议使用 Chrome/Edge(Web MIDI 支持;Safari 可用键盘回退)。

## 3. 上云(HTTPS/WSS)

### 3.1 方案 A — 内置 TLS(证书直接给 Node)

```bash
export PORT=8443
export WSS_TLS_CERT=/etc/letsencrypt/live/example.com/fullchain.pem
export WSS_TLS_KEY=/etc/letsencrypt/live/example.com/privkey.pem
npm start            # 自动变为 wss://
```

访问 `https://example.com:8443`。证书可用 Let's Encrypt 免费申请:
`certbot certonly --standalone -d example.com`。

### 3.2 方案 B — 反代(nginx + certbot,推荐生产)

Node 仍监听内网端口(如 8080),由 nginx 终结 TLS 并反代 HTTP 与 WebSocket:

```nginx
server {
  listen 443 ssl http2;
  server_name example.com;
  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
  }
  location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

### 3.3 systemd 常驻示例

```ini
[Unit]
Description=Orchestra server
After=network.target

[Service]
WorkingDirectory=/srv/orchestra
ExecStart=/usr/bin/npm start
Restart=always
Environment=PORT=8080
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 4. 端口与安全提示

- `PORT` 默认 8080,`HOST` 默认 0.0.0.0(局域网可达);仅本机用可 `HOST=127.0.0.1`
- 房间码为 6 位(字母表剔除易混淆字符),当前无鉴权——适合熟人合奏;
  若需公开运营,可后续在 createRoom/join 上增加口令(见 plan-v2 远期项)
- WebSocket 无 CORS 限制:任何网页都能连你的端点。公开部署建议在 nginx 层
  限制来源(可选)或接受这一开放性(本项目为熟人合奏场景,风险可接受)

## 5. 验证部署

```bash
# 页面可达
curl -I http://localhost:8080          # 200,text/html
# WebSocket 可用(用 node 起个 ws 客户端脚本或直接用两个浏览器验证合奏)
```

浏览器内自检: 打开页面 → 创建房间 → 房间码出现在 Status 面板 → 第二个浏览器
凭码加入 → 双方花名册互见、敲键互听。

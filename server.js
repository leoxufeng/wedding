/**
 * 婚礼弹幕墙 · 实时服务端
 * Express + WebSocket + QR Code + 背景图上传
 */

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const multer   = require('multer');
const QRCode   = require('qrcode');

// ─── 获取本机局域网 IP ─────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

const PORT     = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();

// PUBLIC_URL 优先（用于内网穿透或云部署），否则用本机局域网地址
// 例：set PUBLIC_URL=https://abcd-1234.cpolar.io  再启动
const BASE_URL  = process.env.PUBLIC_URL
  ? process.env.PUBLIC_URL.replace(/\/$/, '')           // 去掉末尾斜杠
  : `http://${LOCAL_IP}:${PORT}`;
const GUEST_URL   = `${BASE_URL}/guest.html`;
const DISPLAY_URL = `${BASE_URL}/display.html`;

// ─── 全局状态 ──────────────────────────────────────────────
let settings = {
  groomName:   '新郎',
  brideName:   '新娘',
  weddingDate: '',
  bgImageUrl:  '',
  bgOpacity:   0.45,
  danmuSpeed:  0.6,
  showPetals:  true,
  theme:       'rose',   // rose | gold | purple | blue
};

let messages   = [];   // 最多保存 500 条
let totalCount = 0;
const rateLimitMap = new Map();  // ip -> lastSentTime

// ─── Express & WebSocket ───────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname, { index: false }));

// ─── 文件上传（背景图）────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'bg_' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

// ─── REST 接口 ─────────────────────────────────────────────
// 生成二维码
app.get('/api/qrcode', async (req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(GUEST_URL, {
      width: 280, margin: 2,
      color: { dark: '#1a0010', light: '#fff8f0' },
      errorCorrectionLevel: 'M'
    });
    res.json({ qr: dataUrl, url: GUEST_URL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取/更新设置
app.get('/api/settings', (req, res) => res.json(settings));
app.post('/api/settings', (req, res) => {
  const allowed = ['groomName','brideName','weddingDate','bgImageUrl',
                   'bgOpacity','danmuSpeed','showPetals','theme'];
  allowed.forEach(k => { if (req.body[k] !== undefined) settings[k] = req.body[k]; });
  broadcast({ type: 'settings', data: settings });
  res.json({ ok: true });
});

// 上传背景图
app.post('/api/upload-bg', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到图片' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ ok: true, url });
});

// 服务器信息
app.get('/api/info', (req, res) => {
  res.json({
    ip: LOCAL_IP, port: PORT,
    guestUrl: GUEST_URL,
    displayUrl: `http://${LOCAL_IP}:${PORT}/display.html`,
    totalCount,
    onlineClients: wss.clients.size
  });
});

// 历史消息
app.get('/api/messages', (req, res) => {
  res.json({ messages: messages.slice(-50), totalCount });
});

// ─── WebSocket ─────────────────────────────────────────────
function broadcast(data, exceptWs = null) {
  const str = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && ws !== exceptWs) {
      ws.send(str);
    }
  });
}

wss.on('connection', (ws, req) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // 推送初始化数据
  ws.send(JSON.stringify({
    type: 'init',
    settings,
    messages:   messages.slice(-30),
    totalCount,
    guestUrl:   GUEST_URL,
    serverUrl:  `http://${LOCAL_IP}:${PORT}`,
    onlineClients: wss.clients.size
  }));

  // 广播在线人数更新
  broadcast({ type: 'online', count: wss.clients.size });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'danmu') {
        // 简单限速：同一IP 1.5 秒内只能发一条
        const now = Date.now();
        const last = rateLimitMap.get(clientIP) || 0;
        if (now - last < 1500) {
          ws.send(JSON.stringify({ type: 'error', msg: '发送太快啦，请稍等～' }));
          return;
        }
        rateLimitMap.set(clientIP, now);

        const name = String(msg.name || '').slice(0, 10).trim();
        const text = String(msg.text || '').slice(0, 35).trim();
        if (!text) return;

        const dm = { id: now + '_' + Math.random().toString(36).slice(2),
                     name, text, time: now };
        messages.push(dm);
        totalCount++;
        if (messages.length > 500) messages.splice(0, 100);

        broadcast({ type: 'danmu', data: dm, totalCount });
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (_) { /* ignore */ }
  });

  ws.on('close', () => {
    setTimeout(() => broadcast({ type: 'online', count: wss.clients.size }), 100);
  });
});

// 每 30s 清理过期限速记录
setInterval(() => {
  const cutoff = Date.now() - 30000;
  for (const [ip, t] of rateLimitMap) {
    if (t < cutoff) rateLimitMap.delete(ip);
  }
}, 30000);

// ─── 启动 ──────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const isPublic = !!process.env.PUBLIC_URL;
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         婚礼弹幕墙  ·  服务启动成功              ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  大屏地址: ${DISPLAY_URL}`);
  console.log(`║  宾客地址: ${GUEST_URL}`);
  if (!isPublic) {
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  ⚠  当前为局域网模式，宾客需连同一 WiFi        ║');
    console.log('║     如需公网访问，请参考「公网启动说明.txt」    ║');
  } else {
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  ✅ 公网模式，宾客可用 4G/5G 直接扫码          ║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  按 Ctrl+C 停止服务                              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
});

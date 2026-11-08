// ============================================================================
//  RUST — простой статический HTTP-сервер для синглплеер-сборки.
//  Запуск:  node server.js
//  Открой в браузере:  http://localhost:8080
//
//  Без внешних зависимостей (только встроенный модуль http + fs).
//  Мультиплеер убран — сервер только раздаёт статику (index.html + main.js + scr/).
// ============================================================================
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 8080;
// Корневая папка — там, где лежит этот файл server.js
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',  // ✅ Добавлено для новых иконок компонентов крафта
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.glb':  'model/gltf-binary',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    // Декодируем URL, защищаемся от path-traversal
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    // Защита от ..
    const safePath = path.normalize(path.join(ROOT, urlPath));
    if (!safePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden');
        return;
    }

    fs.stat(safePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + urlPath);
            return;
        }
        const ext = path.extname(safePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        // ✅ Cache-Control: no-cache — browser всегда загружает свежие файлы (для dev)
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(safePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log('============================================================');
    console.log('  RUST — однопользовательская сборка запущена');
    console.log('  Открой в браузере:  http://localhost:' + PORT);
    console.log('  Ctrl+C чтобы остановить');
    console.log('============================================================');
});

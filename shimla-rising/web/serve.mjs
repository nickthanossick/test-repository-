#!/usr/bin/env node
// Shimla Rising ka static server. Koi dependency nahi -- sirf `node web/serve.mjs`.
// Repo root serve karta hai taaki game /web/ se `/data/` bhi padh sake.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/web/index.html";
    // path traversal guard -- normalize karke check karo ki ROOT ke andar hi hai
    const full = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

    let target = full;
    const s = await stat(target).catch(() => null);
    if (s?.isDirectory()) target = join(target, "index.html");

    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("404");
  }
}).listen(PORT, () => {
  console.log(`Shimla Rising -> http://localhost:${PORT}/web/`);
});

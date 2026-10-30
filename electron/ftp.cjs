// Minimal FTP server (camera receiver) + client (NAS import/upload), Node "net" only — no extra
// dependencies so electron-builder packaging stays unchanged.
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

function localIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
  }
  return out;
}

const v4 = (a) => String(a || "").replace(/^::ffff:/, "");

// ---------------- Server ----------------
function createServer({ port, user, pass, dir, onFile, onLog }) {
  fs.mkdirSync(dir, { recursive: true });
  const log = (m) => { try { onLog && onLog(m); } catch {} };
  const srv = net.createServer((sock) => {
    let authed = false, givenUser = "", cwd = "/", pasv = null, pending = null, active = null, renameFrom = "";
    const reply = (s) => { try { sock.write(s + "\r\n"); } catch {} };
    const peer = v4(sock.remoteAddress);
    log(`Connesso: ${peer}`);
    reply("220 LoMa VIEWER FTP pronto");

    const closePasv = () => { if (pasv) { try { pasv.close(); } catch {} pasv = null; } };
    const dataSocket = () => {
      if (active) { const a = active; active = null; return new Promise((res, rej) => { const s = net.connect(a.port, a.host, () => res(s)); s.on("error", rej); }); }
      if (pending) { const p = pending; pending = null; return p; }
      return Promise.reject(new Error("no data"));
    };
    const openPasv = () => new Promise((res) => {
      closePasv();
      const s = net.createServer();
      pending = new Promise((ok, ko) => {
        s.once("connection", (d) => { ok(d); closePasv(); });
        setTimeout(() => ko(new Error("timeout")), 30000);
      });
      pending.catch(() => {});
      s.listen(0, "0.0.0.0", () => { pasv = s; res(s.address().port); });
    });
    const safeName = (n) => path.basename(String(n).replace(/\\/g, "/")).replace(/[<>:"|?*\x00-\x1f]/g, "_") || "foto";
    const listing = () => fs.readdirSync(dir).filter((n) => !n.startsWith(".")).map((n) => {
      const st = fs.statSync(path.join(dir, n));
      return { n, st };
    }).filter((x) => x.st.isFile());

    let buf = "";
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        handle(line).catch((e) => reply("451 " + (e && e.message || e)));
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => { closePasv(); log(`Disconnesso: ${peer}`); });

    async function handle(line) {
      const sp = line.indexOf(" ");
      const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      const arg = sp < 0 ? "" : line.slice(sp + 1);
      if (cmd === "USER") { givenUser = arg; return reply("331 Password richiesta"); }
      if (cmd === "PASS") {
        if (givenUser === user && arg === pass) { authed = true; log(`Accesso: ${givenUser}@${peer}`); return reply("230 Accesso eseguito"); }
        log(`Accesso rifiutato: ${givenUser}@${peer}`); return reply("530 Utente o password errati");
      }
      if (cmd === "QUIT") { reply("221 Ciao"); return sock.end(); }
      if (cmd === "AUTH" || cmd === "PBSZ" || cmd === "PROT") return reply("502 TLS non supportato");
      if (cmd === "FEAT") { sock.write("211-Features:\r\n EPSV\r\n PASV\r\n SIZE\r\n UTF8\r\n211 End\r\n"); return; }
      if (cmd === "SYST") return reply("215 UNIX Type: L8");
      if (cmd === "NOOP") return reply("200 OK");
      if (!authed) return reply("530 Accesso richiesto");
      switch (cmd) {
        case "OPTS": case "TYPE": case "MODE": case "STRU": case "ALLO": case "SITE": return reply("200 OK");
        case "PWD": case "XPWD": return reply(`257 "${cwd}"`);
        case "CWD": case "XCWD": cwd = arg.startsWith("/") ? arg : path.posix.join(cwd, arg); return reply("250 OK");
        case "CDUP": cwd = path.posix.dirname(cwd); return reply("250 OK");
        case "MKD": case "XMKD": return reply(`257 "${arg}" creata`);
        case "RMD": case "XRMD": return reply("250 OK");
        case "REST": return reply("350 OK");
        case "ABOR": return reply("226 OK");
        case "PASV": { const p = await openPasv(); const ip = v4(sock.localAddress).split("."); return reply(`227 Entering Passive Mode (${ip.join(",")},${p >> 8},${p & 255})`); }
        case "EPSV": { const p = await openPasv(); return reply(`229 Entering Extended Passive Mode (|||${p}|)`); }
        case "PORT": { const a = arg.split(",").map(Number); active = { host: a.slice(0, 4).join("."), port: a[4] * 256 + a[5] }; return reply("200 OK"); }
        case "EPRT": { const a = arg.split(arg[0]); active = { host: a[2], port: Number(a[3]) }; return reply("200 OK"); }
        case "SIZE": { try { return reply("213 " + fs.statSync(path.join(dir, safeName(arg))).size); } catch { return reply("550 Non trovato"); } }
        case "MDTM": { try { const d = fs.statSync(path.join(dir, safeName(arg))).mtime; return reply("213 " + d.toISOString().replace(/[-:T]/g, "").slice(0, 14)); } catch { return reply("550 Non trovato"); } }
        case "DELE": { try { fs.unlinkSync(path.join(dir, safeName(arg))); } catch {} return reply("250 OK"); }
        case "RNFR": renameFrom = safeName(arg); return reply("350 OK");
        case "RNTO": { try { fs.renameSync(path.join(dir, renameFrom), path.join(dir, safeName(arg))); } catch {} return reply("250 OK"); }
        case "LIST": case "NLST": case "MLSD": {
          const d = await dataSocket().catch(() => null);
          if (!d) return reply("425 Connessione dati non aperta");
          reply("150 Elenco");
          const items = listing();
          const text = items.map(({ n, st }) => cmd === "NLST" ? n
            : cmd === "MLSD" ? `type=file;size=${st.size}; ${n}`
            : `-rw-r--r-- 1 loma loma ${st.size} Jan 01 00:00 ${n}`).join("\r\n");
          d.end(text ? text + "\r\n" : "", () => reply("226 Fatto"));
          return;
        }
        case "RETR": {
          const f = path.join(dir, safeName(arg));
          if (!fs.existsSync(f)) return reply("550 Non trovato");
          const d = await dataSocket().catch(() => null);
          if (!d) return reply("425 Connessione dati non aperta");
          reply("150 Invio");
          fs.createReadStream(f).pipe(d).on("finish", () => reply("226 Fatto"));
          return;
        }
        case "STOR": case "APPE": case "STOU": {
          const d = await dataSocket().catch(() => null);
          if (!d) return reply("425 Connessione dati non aperta");
          const name = safeName(arg || `foto_${Date.now()}.jpg`);
          const ext = path.extname(name), base = path.basename(name, ext);
          let dest = path.join(dir, name), k = 1;
          if (cmd !== "APPE") while (fs.existsSync(dest)) dest = path.join(dir, `${base} (${k++})${ext}`);
          reply("150 Ricezione");
          const w = fs.createWriteStream(dest, { flags: cmd === "APPE" ? "a" : "w" });
          d.pipe(w);
          w.on("finish", () => { reply("226 Ricevuto"); log(`Ricevuto: ${path.basename(dest)}`); try { onFile && onFile(dest); } catch {} });
          w.on("error", (e) => reply("451 " + e.message));
          return;
        }
        default: return reply("502 Comando non supportato");
      }
    }
  });
  return new Promise((res, rej) => {
    srv.once("error", rej);
    srv.listen(port, "0.0.0.0", () => res(srv));
  });
}

// ---------------- Client ----------------
class Client {
  constructor() { this.sock = null; this.lines = []; this.waiters = []; this.buf = ""; this.cur = null; }
  connect(host, port) {
    this.host = host;
    return new Promise((res, rej) => {
      const s = net.connect(port || 21, host);
      s.setTimeout(20000, () => s.destroy(new Error("Timeout di connessione")));
      s.on("error", (e) => { rej(e); this.waiters.splice(0).forEach((w) => w.rej(e)); });
      s.on("data", (c) => this._feed(c.toString("utf8")));
      this.sock = s;
      this.read().then((r) => (r.code === 220 ? res() : rej(new Error(r.text))), rej);
    });
  }
  _feed(t) {
    this.buf += t;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, ""); this.buf = this.buf.slice(i + 1);
      if (!this.cur) {
        const m = /^(\d{3})([ -])(.*)$/.exec(line); if (!m) continue;
        if (m[2] === " ") { this._push({ code: +m[1], text: m[3] }); continue; }
        this.cur = { code: m[1], text: [m[3]] };
      } else if (line.startsWith(this.cur.code + " ")) {
        this.cur.text.push(line.slice(4)); this._push({ code: +this.cur.code, text: this.cur.text.join("\n") }); this.cur = null;
      } else this.cur.text.push(line);
    }
  }
  _push(r) { const w = this.waiters.shift(); if (w) w.res(r); else this.lines.push(r); }
  read() { const r = this.lines.shift(); if (r) return Promise.resolve(r); return new Promise((res, rej) => this.waiters.push({ res, rej })); }
  async cmd(c, ok) {
    this.sock.write(c + "\r\n");
    const r = await this.read();
    if (ok && !ok.includes(Math.floor(r.code / 100))) throw new Error(`${c.split(" ")[0] === "PASS" ? "PASS" : c}: ${r.code} ${r.text}`);
    return r;
  }
  async login(u, p) {
    const r = await this.cmd("USER " + (u || "anonymous"), [2, 3]);
    if (r.code === 331) await this.cmd("PASS " + (p || ""), [2]);
    await this.cmd("TYPE I", [2]);
  }
  async _data() {
    let r = await this.cmd("EPSV");
    let port;
    if (r.code === 229) port = Number(/\|\|\|(\d+)\|/.exec(r.text)?.[1]);
    else { r = await this.cmd("PASV", [2]); const n = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(r.text); port = +n[5] * 256 + +n[6]; }
    return new Promise((res, rej) => { const s = net.connect(port, this.host, () => res(s)); s.on("error", rej); });
  }
  async transfer(c, sendBuf) {
    const d = await this._data();
    const chunks = [];
    const done = new Promise((res, rej) => { d.on("data", (x) => chunks.push(x)); d.on("close", res); d.on("error", rej); });
    const r = await this.cmd(c);
    if (r.code >= 400) { d.destroy(); throw new Error(`${c}: ${r.code} ${r.text}`); }
    if (sendBuf) d.end(sendBuf);
    await done;
    const end = await this.read();
    if (end.code >= 400) throw new Error(`${c}: ${end.code} ${end.text}`);
    return Buffer.concat(chunks);
  }
  async cwd(dir) { if (dir && dir !== "/") await this.cmd("CWD " + dir, [2]); else if (dir === "/") await this.cmd("CWD /", [2]); }
  close() { try { this.sock.write("QUIT\r\n"); this.sock.end(); } catch {} }
}

async function withClient(p, fn) {
  const c = new Client();
  try { await c.connect(p.host, Number(p.port) || 21); await c.login(p.user, p.pass); await c.cwd(p.dir || ""); return await fn(c); }
  finally { c.close(); }
}

const IMG_RE = /\.(dng|cr2|cr3|nef|arw|rw2|orf|raf|tiff?|psd|psb|heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i;
function parseList(text) {
  return text.split(/\r?\n/).map((l) => {
    if (!l.trim()) return null;
    if (/^\S+=\S*;/.test(l)) { // MLSD
      const sp = l.indexOf(" "); const facts = l.slice(0, sp); const name = l.slice(sp + 1);
      if (!/type=file/i.test(facts)) return null;
      return { name, size: Number(/size=(\d+)/i.exec(facts)?.[1] || 0) };
    }
    const u = /^([-dl])\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(l);
    if (u) return u[1] === "-" ? { name: u[3], size: +u[2] } : null;
    const w = /^\d\d-\d\d-\d\d\s+\d\d:\d\d[AP]M\s+(<DIR>|\d+)\s+(.+)$/i.exec(l); // IIS/Windows
    if (w) return w[1] === "<DIR>" ? null : { name: w[2], size: +w[1] };
    return null;
  }).filter((x) => x && IMG_RE.test(x.name));
}

async function list(p) {
  return withClient(p, async (c) => {
    let txt = "";
    try { txt = (await c.transfer("MLSD")).toString("utf8"); } catch { txt = (await c.transfer("LIST")).toString("utf8"); }
    return parseList(txt).sort((a, b) => a.name.localeCompare(b.name));
  });
}
const download = (p, name) => withClient(p, async (c) => new Uint8Array(await c.transfer("RETR " + name)));
const upload = (p, name, bytes) => withClient(p, async (c) => { await c.transfer("STOR " + name, Buffer.from(bytes)); return true; });
const test = (p) => withClient(p, async (c) => { const r = await c.cmd("PWD"); return /"([^"]*)"/.exec(r.text)?.[1] || "/"; });

module.exports = { createServer, localIPs, list, download, upload, test, parseList };

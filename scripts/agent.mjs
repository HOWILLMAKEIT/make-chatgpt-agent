#!/usr/bin/env node
// 跨平台(macOS / Linux / Windows)启动与停止 ngrok 和 devspace。
// 用法: NGROK_DOMAIN=xxx.ngrok-free.dev node scripts/agent.mjs start
//       node scripts/agent.mjs stop
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const IS_WIN = process.platform === 'win32';
const PORT = process.env.DEVSPACE_PORT || '7676';
const STATE_DIR = join(homedir(), '.make-chatgpt-agent');
const PID_FILE = join(STATE_DIR, 'pids.json');
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function kill(pid) {
  if (IS_WIN) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} } }
}

function readPids() {
  try { return JSON.parse(readFileSync(PID_FILE, 'utf8')); } catch { return {}; }
}

function hasCommand(cmd) {
  // Windows 下 npm 安装的命令是 .cmd,需要通过 shell 解析
  return spawnSync(cmd, ['--version'], { shell: IS_WIN, stdio: 'ignore' }).status === 0;
}

function launch(name, cmd, args, { env = process.env, cwd } = {}) {
  const logPath = join(STATE_DIR, `${name}.log`);
  const fd = openSync(logPath, 'w');
  const child = spawn(cmd, args, {
    detached: true, shell: IS_WIN, windowsHide: true, stdio: ['ignore', fd, fd], env, cwd,
  });
  child.unref();
  closeSync(fd);
  return { pid: child.pid, logPath };
}

async function start() {
  const domain = process.env.NGROK_DOMAIN || process.argv[3];
  if (!domain) { console.error('请设置 NGROK_DOMAIN,例如 xxx.ngrok-free.dev'); process.exit(1); }
  for (const c of ['ngrok', 'devspace']) {
    if (!hasCommand(c)) { console.error(`未找到 ${c}`); process.exit(1); }
  }
  mkdirSync(STATE_DIR, { recursive: true });

  const old = readPids();
  if (Object.values(old).some((p) => p && alive(p))) {
    console.error('服务已在运行,先执行 stop');
    process.exit(1);
  }

  const cfg = spawnSync('devspace', ['config', 'set', 'publicBaseUrl', `https://${domain}`], { shell: IS_WIN, stdio: 'inherit' });
  if (cfg.status !== 0) process.exit(1);

  // ngrok 免费版不允许走 HTTP 代理,启动时去掉代理环境变量
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(http_proxy|https_proxy|all_proxy)$/i.test(k)) delete env[k];
  }
  const ngrok = launch('ngrok', 'ngrok', ['http', `--url=${domain}`, PORT, '--log=stdout'], { env });
  // 不在项目目录启动,避免 allowedRoots 回退到当前目录
  const devspace = launch('devspace', 'devspace', ['serve'], { cwd: homedir() });
  writeFileSync(PID_FILE, JSON.stringify({ ngrok: ngrok.pid, devspace: devspace.pid }));

  await sleep(5000);
  let ok = true;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`);
    console.log(`本地 /mcp -> HTTP ${r.status} (401 为正常)`);
  } catch { console.log(`devspace 未响应,见 ${devspace.logPath}`); ok = false; }
  const ngrokLog = existsSync(ngrok.logPath) ? readFileSync(ngrok.logPath, 'utf8') : '';
  if (ngrokLog.includes('started tunnel')) console.log('ngrok 已在线');
  else { console.log(`ngrok 未就绪,见 ${ngrok.logPath}`); ok = false; }
  if (!ok) process.exit(1);
  console.log(`ChatGPT 的 Server URL: https://${domain}/mcp`);
}

function stop() {
  const pids = readPids();
  for (const name of ['devspace', 'ngrok']) {
    if (pids[name] && alive(pids[name])) { kill(pids[name]); console.log(`已停止 ${name}`); }
    else console.log(`${name} 未运行`);
  }
  rmSync(PID_FILE, { force: true });
}

const cmd = process.argv[2];
if (cmd === 'start') await start();
else if (cmd === 'stop') stop();
else { console.error('用法: node scripts/agent.mjs <start|stop>'); process.exit(1); }

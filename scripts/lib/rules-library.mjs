// The local Google rules library (RAGFlow in Docker Desktop, about 9 GB in the WSL VM) runs only while a claude-seo
// audit needs it: started before the audit, stopped after it and the VM's memory given back to Windows (owner
// 2026-11-17: "就是内存得释放"; two sites run at once had failed VirtualAlloc with the library always on). Paths and
// timeouts: config/rules-library.json. Manual use: scripts/rules-library.mjs start|stop|status.
//
// Who still needs it is counted in a folder every site's pipeline on this machine sees (lockDir): one holder file per
// audit (holders/<id>.json: { id, pid, label, root, host, since }; pid null for a manual start, which only stop
// removes), so three auditors at once and sites audited in turn all count. A holder whose process is gone (a crash)
// is stale and removed. Starting and stopping take transition.lock ({ pid, action, since }) so no audit starts the
// library while another stops it. Pipelines on older code register no holder (owner 2026-11-17, site15-tapaworks):
// before stopping, established TCP connections to the library's ports from any other process keep it up too.
//
// Starting: the MCP answers initialize with 200, else Docker Desktop is launched when its engine is down (a reported
// stale socket: Docker Desktop is stopped, its run and docker-secrets-engine folders renamed *.stale-<date>, never
// deleted, never a factory reset, and it is launched once more; one that does not answer stop has its processes ended),
// then compose up, then initialize is waited for. Docker Desktop stopped here has its run folders renamed at once (the
// sockets it leaves are stale at its next launch).
// Stopping: compose stop; Docker Desktop quits only when no container outside the library runs (Firecrawl and the
// like stay up); wsl --shutdown only when no WSL distribution but Docker's own runs. Every step is logged with its
// time; a failed start is an error, a failed stop a warning. No system setting (.wslconfig) is touched.

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { basename, join, resolve } from 'node:path';
import config from '../../config/rules-library.json' with { type: 'json' };
import firecrawl from '../../config/firecrawl.json' with { type: 'json' };

export const RULES_LIBRARY = Object.freeze(config);
// Firecrawl (the GEO module's page fetcher) in the same Docker Desktop, held and let go the same way: config/firecrawl.json
// over the library's Docker settings (2026-11-18: the library's stop quit Docker Desktop and Firecrawl with it, and
// every blog run since fetched none of its cited pages).
export const FIRECRAWL = Object.freeze({ ...config, ...firecrawl, compose: firecrawl.compose });

const INITIALIZE = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'seo-site-template rules-library', version: '1' } } });
const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

const expand = (text, env) => text.replace(/\{(\w+)\}/g, (whole, name) => (name === 'HOME' ? env.USERPROFILE || env.HOME || homedir() : env[name]) ?? whole);

// config/rules-library.json with the user's folders filled in.
export function librarySettings(env = process.env, base = RULES_LIBRARY) {
  const path = (text) => resolve(expand(text, env));
  return {
    url: base.mcpUrl, probe: base.probe ?? 'mcp', name: base.name ?? 'the rules library', docker: path(base.docker), dockerDesktop: path(base.dockerDesktop), wsl: base.wsl, taskkill: base.taskkill ?? 'taskkill.exe', dockerProcesses: base.dockerProcesses ?? [],
    compose: { ...base.compose, files: [base.compose.file].flat().map(path), file: path([base.compose.file].flat()[0]), profiles: base.compose.profiles ?? [] },
    staleDirs: base.staleDirs.map(path), backendLog: path(base.backendLog),
    staleSocket: new RegExp(base.staleSocketPattern, 'i'), wslNoneRunning: new RegExp(base.wslNoneRunningPattern, 'i'),
    ports: base.watchPorts, lockDir: path(base.lockDir), timeouts: base.timeouts, services: base.services ?? null,
  };
}

// A command's { code, stdout, stderr }; it never throws (a missing file or a timeout is a non-zero code).
export const execCommand = (file, args, { timeoutMs = 60000, env } = {}) => new Promise((done) => {
  execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: env ?? process.env }, (error, stdout, stderr) => {
    done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (error && typeof error.code !== 'number' ? error.message : '') });
  });
});

// Docker Desktop started on its own, not waited for.
export async function launchDetached(file) {
  if (!existsSync(file)) return { ok: false, detail: `not found: ${file}` };
  return new Promise((done) => {
    const child = spawn(file, [], { detached: true, stdio: 'ignore' });
    child.once('error', (error) => done({ ok: false, detail: error.message }));
    child.once('spawn', () => { child.unref(); done({ ok: true }); });
  });
}

export const processAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

// Get-NetTCPConnection's JSON (one object or a list, nothing when there is none) as [{ localPort, remotePort, pid }].
export function parseConnections(stdout) {
  const text = stdout.trim();
  if (!text) return [];
  const rows = [JSON.parse(text)].flat();
  return rows.map((row) => ({ localAddress: row.LocalAddress, localPort: row.LocalPort, remoteAddress: row.RemoteAddress, remotePort: row.RemotePort, pid: row.OwningProcess }));
}

// The connections that are someone else's: the server side of a connection to one of the ports, unless its client
// side is this process (fetch keeps its own connection open a few seconds after the last request).
export function externalConnections(rows, ports, ownPid) {
  const own = new Set(rows.filter((row) => ports.includes(row.remotePort) && row.pid === ownPid).map((row) => row.localPort));
  return rows.filter((row) => ports.includes(row.localPort) && !own.has(row.remotePort));
}

const tcpConnections = (exec, ports, timeoutMs) => async () => {
  const list = ports.join(',');
  const script = 'Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in ' + list + ' -or $_.RemotePort -in ' + list + ' } | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess | ConvertTo-Json -Compress';
  const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs });
  if (result.code !== 0) throw new Error(`Get-NetTCPConnection exited ${result.code}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
  return parseConnections(result.stdout);
};

const pad = (number) => String(number).padStart(2, '0');
const stamp = (ms) => { const date = new Date(ms); return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`; };
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const tail = (text, chars = 400) => text.trim().slice(-chars);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// The step log: the audit's own output (site-run keeps it in .pipeline/logs) and one log for all sites in lockDir.
const defaultLog = (lockDir) => (line, level = 'info') => {
  const text = `rules-library: ${level === 'warn' ? 'WARNING ' : ''}${line}`;
  (level === 'warn' ? console.warn : console.log)(text);
  return mkdir(lockDir, { recursive: true }).then(() => appendFile(join(lockDir, 'rules-library.log'), `${new Date().toISOString()} pid ${process.pid} ${text}\n`)).catch(() => {});
};

// Everything that touches the machine is passed in (a test passes stand-ins).
export function createRulesLibrary({ settings = librarySettings(), exec = execCommand, fetch = globalThis.fetch, launch = launchDetached, alive = processAlive, connections, sleep = wait, now = Date.now, log, pid = process.pid } = {}) {
  const t = settings.timeouts;
  const write = log ?? defaultLog(settings.lockDir);
  const say = (line) => write(line);
  const warn = (line) => write(line, 'warn');
  const listConnections = connections ?? tcpConnections(exec, settings.ports, t.commandMs);
  const holdersDir = join(settings.lockDir, 'holders');
  const transitionFile = join(settings.lockDir, 'transition.lock');
  const docker = (args, timeoutMs = t.commandMs) => exec(settings.docker, args, { timeoutMs });
  const composeArgs = ['compose', '-p', settings.compose.project, ...(settings.compose.files ?? [settings.compose.file]).flatMap((file) => ['-f', file]), ...(settings.compose.profiles ?? []).flatMap((profile) => ['--profile', profile])];

  async function mcpUp() {
    // A plain service (probe http) answers any page below a server error; the library answers MCP initialize.
    if (settings.probe === 'http') {
      try {
        const response = await fetch(settings.url, { signal: AbortSignal.timeout(10000) });
        await response.text().catch(() => '');
        return response.status < 500 ? { ok: true } : { ok: false, detail: `HTTP ${response.status}` };
      } catch (error) {
        return { ok: false, detail: error.cause?.code || error.message };
      }
    }
    try {
      const response = await fetch(settings.url, { method: 'POST', headers: MCP_HEADERS, body: INITIALIZE, signal: AbortSignal.timeout(10000) });
      await response.text().catch(() => '');
      return response.status === 200 ? { ok: true } : { ok: false, detail: `initialize answered HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, detail: error.cause?.code || error.message };
    }
  }

  const engineUp = async () => {
    const result = await docker(['info', '--format', '{{.ServerVersion}}']);
    return { ok: result.code === 0, output: `${result.stdout}\n${result.stderr}` };
  };

  const logSize = async () => (await stat(settings.backendLog).catch(() => null))?.size ?? 0;
  async function logSince(offset) {
    const handle = await open(settings.backendLog, 'r').catch(() => null);
    if (!handle) return '';
    try {
      const size = (await handle.stat()).size;
      const from = size < offset ? 0 : offset;
      const length = Math.min(size - from, 1024 * 1024);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally { await handle.close(); }
  }

  // Until the engine answers, a stale socket is reported, or the time is up.
  async function waitEngine(offset) {
    const deadline = now() + t.dockerReadyMs;
    for (;;) {
      const engine = await engineUp();
      if (engine.ok) return { ok: true };
      const line = `${engine.output}\n${await logSince(offset)}`.split(/\r?\n/).find((text) => settings.staleSocket.test(text));
      if (line) return { ok: false, stale: true, detail: line.trim().slice(0, 300) };
      if (now() >= deadline) return { ok: false, detail: `the Docker engine did not answer docker info within ${seconds(t.dockerReadyMs)}: ${tail(engine.output, 300)}` };
      await sleep(t.pollMs);
    }
  }

  // Renamed, never deleted (owner 2026-11-17); a name already taken gets -2, -3. used: only a folder something is left in.
  async function renameStale({ used = false } = {}) {
    const suffix = `stale-${stamp(now())}`;
    for (const dir of settings.staleDirs) {
      if (!existsSync(dir)) { say(`stale socket: ${dir} is not there, nothing to rename`); continue; }
      if (used && !(await readdir(dir)).length) continue;
      let target = `${dir}.${suffix}`;
      for (let n = 2; existsSync(target); n += 1) target = `${dir}.${suffix}-${n}`;
      await rename(dir, target);
      say(`stale socket: renamed ${dir} to ${basename(target)}`);
    }
  }

  async function startDocker() {
    for (const attempt of [1, 2]) {
      const begun = now();
      const offset = await logSize();
      const launched = await launch(settings.dockerDesktop);
      if (!launched.ok) return { ok: false, detail: `Docker Desktop could not be launched (${settings.dockerDesktop}): ${launched.detail}` };
      say(`docker desktop: launched (attempt ${attempt}), waiting for the engine`);
      const engine = await waitEngine(offset);
      if (engine.ok) { say(`docker desktop: the engine answers (${seconds(now() - begun)})`); return { ok: true }; }
      if (attempt === 2) return { ok: false, detail: engine.stale ? `Docker Desktop still reports a stale socket after its run folders were renamed: ${engine.detail}` : engine.detail };
      // An engine that never answers is the same state (2026-11-17: Docker Desktop's processes left running after a stale
      // socket, so a launch did nothing and the stale line was in the log before it): recovered the same way.
      say(`docker desktop: ${engine.stale ? `stale socket reported (${engine.detail})` : `no engine (${engine.detail})`}; stopping Docker Desktop, renaming its run folders, launching it again`);
      const stopped = await docker(['desktop', 'stop', '--timeout', String(Math.round(t.stopMs / 1000))], t.stopMs + 10000);
      // Docker Desktop with a stale socket may not answer stop (2026-11-17: it timed out after 180 s): its processes are
      // ended instead, as a stop would (taskkill exits 128 when none of them runs).
      if (stopped.code !== 0) {
        say(`docker desktop stop failed (exit ${stopped.code}): ending its processes (${settings.dockerProcesses.join(', ')})`);
        const ended = await exec(settings.taskkill, ['/F', '/T', ...settings.dockerProcesses.flatMap((name) => ['/IM', name])], { timeoutMs: t.commandMs });
        if (ended.code !== 0 && ended.code !== 128) return { ok: false, detail: `${engine.stale ? 'Docker Desktop reported a stale socket' : engine.detail}; it did not stop (exit ${stopped.code}) and its processes could not be ended (exit ${ended.code}): ${tail(ended.stderr || ended.stdout, 300)}` };
        await sleep(t.pollMs);
      }
      try { await renameStale(); } catch (error) { return { ok: false, detail: `the stale socket folders could not be renamed: ${error.message}` }; }
    }
    return { ok: false, detail: 'unreachable' };
  }

  // ready: what else must answer once initialize does (the audit's retrieval).
  // The library's services that are not running (its compose project's services less the running ones); null when
  // compose cannot tell.
  async function stoppedServices() {
    // The services the config names (Firecrawl: its api and what that depends on), else the project's.
    const [all, running] = await Promise.all([settings.services ? { code: 0, stdout: settings.services.join('\n') } : docker([...composeArgs, 'config', '--services']), docker([...composeArgs, 'ps', '--services', '--status', 'running'])]);
    if (all.code !== 0 || running.code !== 0) return null;
    const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const up = new Set(lines(running.stdout));
    return lines(all.stdout).filter((service) => !up.has(service));
  }

  async function start({ ready } = {}) {
    const begun = now();
    const first = await mcpUp();
    if (first.ok) {
      // The MCP answering is not the whole library: its search stores may be stopped behind it (2026-11-18: elasticsearch,
      // mysql and ragflow stopped by hand, initialize still answered, and an audit waited about 20 minutes). Every
      // service running and the retrieval answering: running; else compose up brings back what is stopped.
      const stopped = await stoppedServices();
      const answers = stopped?.length ? null : ready ? await ready() : { ok: true };
      if (stopped && !stopped.length && answers.ok) { say(`${settings.url} answers initialize and every service runs: already running`); return { ok: true, started: false }; }
      say(`${settings.url} answers initialize, but ${stopped?.length ? `services are not running (${stopped.join(', ')})` : stopped === null ? 'compose cannot list its services' : `the retrieval does not answer (${answers.detail})`}: compose up`);
    } else {
      say(`${settings.url} does not answer (${first.detail}): starting ${settings.name}`);
      if ((await engineUp()).ok) say('docker: the engine is running');
      else {
        const started = await startDocker();
        if (!started.ok) return started;
      }
    }
    const composeBegun = now();
    const up = await docker([...composeArgs, 'up', '-d', ...(settings.services ?? [])], t.composeMs);
    if (up.code !== 0) return { ok: false, detail: `docker compose up failed (exit ${up.code}): ${tail(up.stderr || up.stdout)}` };
    say(`docker compose up -d: done (${seconds(now() - composeBegun)}), waiting for initialize`);
    const deadline = now() + t.mcpReadyMs;
    for (;;) {
      let state = await mcpUp();
      if (state.ok && ready) state = await ready();
      if (state.ok) break;
      if (now() >= deadline) return { ok: false, detail: `${settings.url} did not answer within ${seconds(t.mcpReadyMs)} of compose up: ${state.detail}` };
      await sleep(t.pollMs);
    }
    say(`${settings.url} answers: ${settings.name} started in ${seconds(now() - begun)}`);
    return { ok: true, started: true };
  }

  // Stops what nobody holds. { stopped: false | 'library' | 'docker', reason, warnings }.
  async function stopUnused() {
    const begun = now();
    const warnings = [];
    const fail = (line) => { warnings.push(line); warn(line); return { stopped: false, reason: 'failed', warnings }; };
    let external;
    try { external = externalConnections(await listConnections(), settings.ports, pid); } catch (error) { return fail(`the library stays up: who is connected to ports ${settings.ports.join(', ')} could not be read (${error.message})`); }
    if (external.length) {
      say(`有外部使用者，暂不关闭 (external users, not stopping): ${external.length} established connection(s) to ${external.map((row) => `${row.localAddress}:${row.localPort} from :${row.remotePort}`).join(', ')}; the next audit's end looks again`);
      return { stopped: false, reason: 'external', warnings };
    }
    const composeBegun = now();
    const stopped = await docker([...composeArgs, 'stop'], t.stopMs);
    if (stopped.code !== 0) return fail(`docker compose stop failed (exit ${stopped.code}): ${tail(stopped.stderr || stopped.stdout, 300)}`);
    say(`docker compose stop: done (${seconds(now() - composeBegun)})`);
    const ps = await docker(['ps', '--format', '{{.Names}}|{{.Label "com.docker.compose.project"}}']);
    if (ps.code !== 0) return fail(`Docker Desktop stays up: docker ps failed (exit ${ps.code}): ${tail(ps.stderr || ps.stdout, 300)}`);
    const others = ps.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split('|')).filter(([, project]) => project !== settings.compose.project).map(([name]) => name);
    if (others.length) {
      say(`Docker Desktop stays up: ${others.length} container(s) outside ${settings.name} run (${others.join(', ')}); only ${settings.name} is stopped (${seconds(now() - begun)})`);
      return { stopped: 'library', reason: 'other containers', warnings };
    }
    const desktopBegun = now();
    const quit = await docker(['desktop', 'stop', '--timeout', String(Math.round(t.stopMs / 1000))], t.stopMs + 10000);
    if (quit.code !== 0) return { ...fail(`docker desktop stop failed (exit ${quit.code}): ${tail(quit.stderr || quit.stdout, 300)}`), stopped: 'library' };
    say(`docker desktop stop: done (${seconds(now() - desktopBegun)})`);
    // The sockets Docker Desktop leaves in its run folders are stale at the next launch, which then fails (2026-11-17:
    // every start after a stop here): renamed now, while it is down, so the next audit starts it at once.
    try { await renameStale({ used: true }); } catch (error) { warnings.push(`the run folders could not be renamed after the stop: ${error.message}`); warn(warnings.at(-1)); }
    const listed = await exec(settings.wsl, ['-l', '--running', '-q'], { timeoutMs: t.commandMs, env: { ...process.env, WSL_UTF8: '1' } });
    const output = `${listed.stdout}\n${listed.stderr}`.replaceAll('\u0000', '');
    if (listed.code !== 0 && !settings.wslNoneRunning.test(output)) return { ...fail(`wsl --shutdown not run: wsl -l --running failed (exit ${listed.code}): ${tail(output, 300)}`), stopped: 'docker' };
    const running = listed.code === 0 ? output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
    const otherDistros = running.filter((name) => !name.toLowerCase().startsWith('docker-desktop'));
    if (otherDistros.length) {
      say(`wsl --shutdown not run: other WSL distributions run (${otherDistros.join(', ')}); the VM gives back Docker's memory as it can (${seconds(now() - begun)})`);
      return { stopped: 'docker', reason: 'other WSL distributions', warnings };
    }
    const shutdownBegun = now();
    const shutdown = await exec(settings.wsl, ['--shutdown'], { timeoutMs: t.stopMs });
    if (shutdown.code !== 0) return { ...fail(`wsl --shutdown failed (exit ${shutdown.code}): ${tail(shutdown.stderr || shutdown.stdout, 300)}`), stopped: 'docker' };
    say(`wsl --shutdown: done (${seconds(now() - shutdownBegun)}); the rules library is off and the WSL VM's memory is back (${seconds(now() - begun)})`);
    return { stopped: 'docker', reason: 'unused', warnings };
  }

  const readJsonFile = async (file) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };
  const holderFile = (id) => join(holdersDir, `${id}.json`);

  // Every holder, the stale ones (a process that is gone) removed.
  async function holders() {
    const names = existsSync(holdersDir) ? (await readdir(holdersDir)).filter((name) => name.endsWith('.json')) : [];
    const live = [];
    for (const name of names) {
      const holder = await readJsonFile(join(holdersDir, name));
      if (holder && (holder.pid == null || alive(holder.pid))) { live.push(holder); continue; }
      await rm(join(holdersDir, name), { force: true });
      say(`stale holder ${name} removed (${holder ? `pid ${holder.pid} is gone, ${holder.label} since ${holder.since}` : 'unreadable'})`);
    }
    return live;
  }

  // One start or stop at a time on the machine; a lock left by a process that is gone is taken over.
  async function transition(action, run) {
    await mkdir(settings.lockDir, { recursive: true });
    const deadline = now() + t.transitionWaitMs;
    let waited = false;
    for (;;) {
      try {
        const handle = await open(transitionFile, 'wx');
        await handle.writeFile(JSON.stringify({ pid, action, since: new Date(now()).toISOString() }));
        await handle.close();
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      const held = await readJsonFile(transitionFile);
      const age = now() - ((await stat(transitionFile).catch(() => null))?.mtimeMs ?? now());
      if (held ? !alive(held.pid) : age > 10000) {
        await rm(transitionFile, { force: true });
        say(`stale transition lock removed (${held ? `pid ${held.pid} is gone, ${held.action} since ${held.since}` : 'unreadable'})`);
        continue;
      }
      if (now() >= deadline) throw new Error(`${transitionFile} is held by pid ${held?.pid} (${held?.action} since ${held?.since}) for longer than ${seconds(t.transitionWaitMs)}`);
      if (!waited) { say(`waiting for pid ${held?.pid} to ${held?.action ?? 'start or stop'} the rules library`); waited = true; }
      await sleep(t.pollMs);
    }
    try { return await run(); } finally { await rm(transitionFile, { force: true }); }
  }

  // persistent: a manual start, held until stop. { ok, id, started } | { ok: false, detail }.
  async function acquire({ label = 'claude-seo-audit', root = process.cwd(), ready, persistent = false } = {}) {
    const id = `${persistent ? 'manual' : pid}-${now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      return await transition('start', async () => {
        const others = await holders();
        await mkdir(holdersDir, { recursive: true });
        await writeHolder(id, { id, pid: persistent ? null : pid, label, root, host: hostname(), since: new Date(now()).toISOString() });
        say(`holder ${id} (${label}) registered; ${others.length} other holder(s)`);
        const started = await start({ ready });
        if (started.ok) return { ok: true, id, started: started.started };
        await rm(holderFile(id), { force: true });
        write(`the rules library did not start: ${started.detail}`, 'warn');
        if (!(await holders()).length) await stopUnused();
        return { ok: false, detail: started.detail };
      });
    } catch (error) {
      await rm(holderFile(id), { force: true });
      return { ok: false, detail: error.message };
    }
  }

  async function writeHolder(id, data) {
    const handle = await open(holderFile(id), 'wx');
    try { await handle.writeFile(JSON.stringify(data)); } finally { await handle.close(); }
  }

  // id: the audit's holder; manual: every manual holder (rules-library stop). Never throws: a failed stop is a warning.
  async function release({ id, manual = false } = {}) {
    try {
      return await transition('stop', async () => {
        if (id) await rm(holderFile(id), { force: true });
        if (manual) for (const holder of await holders()) if (holder.pid == null) await rm(holderFile(holder.id), { force: true });
        const live = await holders();
        if (live.length) {
          say(`${id ? `holder ${id} released; ` : ''}the rules library stays up for ${live.length} other holder(s): ${live.map((holder) => `${holder.label} (pid ${holder.pid ?? 'manual'})`).join(', ')}`);
          return { stopped: false, reason: 'held', holders: live.length, warnings: [] };
        }
        say(`${id ? `holder ${id} released; ` : ''}no holder left: stopping ${settings.name}`);
        return stopUnused();
      });
    } catch (error) {
      const line = `the rules library was not stopped: ${error.message}`;
      warn(line);
      return { stopped: false, reason: 'failed', warnings: [line] };
    }
  }

  async function status() {
    const up = await mcpUp();
    const lock = await readJsonFile(transitionFile);
    const list = existsSync(holdersDir) ? await Promise.all((await readdir(holdersDir)).filter((name) => name.endsWith('.json')).map((name) => readJsonFile(join(holdersDir, name)))) : [];
    return { url: settings.url, answers: up.ok, detail: up.detail, lockDir: settings.lockDir, transition: lock, holders: list.filter(Boolean).map((holder) => ({ ...holder, live: holder.pid == null || alive(holder.pid) })) };
  }

  return { settings, acquire, release, status, start, stopUnused };
}

// The audit's use: open before, close after (scripts/claude-seo-audit.mjs, a finally). The leases of this process are
// kept here, so three auditors in one process each hold one and the last close stops the library.
const leases = [];
export async function openRulesLibrary({ url, label, root, ready, deps } = {}) {
  const library = createRulesLibrary(deps);
  if (url && url !== library.settings.url) {
    console.log(`rules-library: ${url} is not the library this machine runs (${library.settings.url}): not started or stopped here`);
    return { ok: true, managed: false };
  }
  const lease = await library.acquire({ label, root, ready });
  if (lease.ok) leases.push({ library, id: lease.id });
  return lease;
}

export async function closeRulesLibrary() {
  const results = [];
  while (leases.length) {
    const { library, id } = leases.pop();
    results.push(await library.release({ id }));
  }
  return results;
}

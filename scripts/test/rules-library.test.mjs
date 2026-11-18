import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { createRulesLibrary, externalConnections, librarySettings, openRulesLibrary, closeRulesLibrary, parseConnections } from '../lib/rules-library.mjs';

// Owner 2026-11-17 ("就是内存得释放"): the rules library starts before an audit and stops after it. Nothing here
// touches Docker, WSL or compose: every command, request and launch goes to the stand-in machine below.
const OWN_PID = 5000;
const SERVICES = ['es01', 'mysql', 'ragflow-cpu', 'mcp-current'];

async function machine({ engine = false, libraryUp = false, staleFirst = false, composeUpFails = false, others = [], distros = ['docker-desktop'], connections = [], readyAfter = 2, livePids = [OWN_PID], desktopStopFails = false, hungFirst = false, stopped = [] } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'rules-library-'));
  const env = { LOCALAPPDATA: join(home, 'local'), USERPROFILE: join(home, 'user') };
  const settings = librarySettings(env);
  const state = { engine, library: libraryUp, stopped: [...stopped], launches: 0, polls: 0, clock: Date.UTC(2026, 10, 17, 9, 30, 0) };
  const calls = [];
  const lines = [];
  const alive = new Set(livePids);
  const exec = async (file, args) => {
    const command = `${basename(file)} ${args.join(' ')}`;
    calls.push(command);
    if (args[0] === 'info') return state.engine ? { code: 0, stdout: '29.7.2', stderr: '' } : { code: 1, stdout: '', stderr: 'error during connect: the docker engine is not running' };
    // The library's services (compose config) and the running ones (compose ps): every one runs with the library but
    // those stopped by hand.
    if (args[0] === 'compose' && args.includes('config')) return { code: 0, stdout: SERVICES.join('\n'), stderr: '' };
    if (args[0] === 'compose' && args.includes('ps')) return { code: 0, stdout: state.library ? SERVICES.filter((name) => !state.stopped.includes(name)).join('\n') : '', stderr: '' };
    if (args[0] === 'compose' && args.at(-2) === 'up') {
      if (composeUpFails) return { code: 1, stdout: '', stderr: 'Error response from daemon: no such image' };
      state.library = true; state.polls = 0; state.stopped = []; return { code: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'compose' && args.at(-1) === 'stop') { state.library = false; return { code: 0, stdout: '', stderr: '' }; }
    if (args[0] === 'ps') return { code: 0, stdout: [...(state.library ? ['google-search-knowledge-mcp-current-1|google-search-knowledge'] : []), ...others.map((name) => `${name}|firecrawl`)].join('\r\n'), stderr: '' };
    if (args[0] === 'desktop' && args[1] === 'stop' && desktopStopFails) return { code: 1, stdout: '', stderr: 'timed out' };
    if (basename(file) === 'taskkill.exe') { state.engine = false; return { code: 0, stdout: '', stderr: '' }; }
    if (args[0] === 'desktop' && args[1] === 'stop') { state.engine = false; return { code: 0, stdout: '', stderr: '' }; }
    if (args.join(' ') === '-l --running -q') return distros.length ? { code: 0, stdout: `${distros.join('\r\n')}\r\n`.split('').join('\u0000'), stderr: '' } : { code: 1, stdout: 'There are no running distributions.', stderr: '' };
    if (args[0] === '--shutdown') return { code: 0, stdout: '', stderr: '' };
    throw new Error(`unexpected command ${command}`);
  };
  const launch = async (file) => {
    calls.push(`launch ${basename(file)}`);
    state.launches += 1;
    if (staleFirst && state.launches === 1) {
      await mkdir(join(env.LOCALAPPDATA, 'Docker/log/host'), { recursive: true });
      await appendFile(settings.backendLog, '[backend] failed to listen: stale socket C:\\Users\\x\\AppData\\Local\\Docker\\run\\docker_engine.sock\n');
    } else if (!(hungFirst && state.launches === 1)) state.engine = true;
    return { ok: true };
  };
  const fetch = async () => {
    if (!state.library) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    state.polls += 1;
    return state.polls > readyAfter ? { status: 200, text: async () => '{"result":{}}' } : { status: 503, text: async () => '' };
  };
  const library = (pid = OWN_PID) => createRulesLibrary({ settings, exec, fetch, launch, pid, alive: (id) => alive.has(id), connections: async () => connections, sleep: async (ms) => { state.clock += ms; }, now: () => state.clock, log: (line, level) => { lines.push(`${level ?? 'info'} ${line}`); } });
  return { home, env, settings, state, calls, lines, alive, library };
}

// The library's profiles as the commands name them (config/rules-library.json compose.profiles).
const profiles = (world) => world.settings.compose.profiles.map((profile) => `--profile ${profile}`).join(' ');
const stopCalls = (calls) => calls.filter((call) => /compose .* stop|desktop stop|--shutdown/.test(call));

test('a library that does not answer is started: Docker Desktop, compose up, then initialize until 200', async () => {
  const world = await machine();
  const lease = await world.library().acquire({ label: 'claude-seo-audit', root: 'D:/site15' });
  assert.deepEqual([lease.ok, lease.started], [true, true]);
  const order = world.calls.filter((call) => !call.startsWith('docker.exe info'));
  assert.deepEqual(order, ['launch Docker Desktop.exe', `docker.exe compose -p google-search-knowledge -f ${world.settings.compose.file} ${profiles(world)} up -d`]);
  assert.ok(world.state.polls > 2, 'initialize was asked until it answered 200');
  const log = world.lines.join('\n');
  assert.match(log, /does not answer \(ECONNREFUSED\): starting/);
  assert.match(log, /docker desktop: the engine answers \(\d+[.]\d s\)/);
  assert.match(log, /docker compose up -d: done/);
  assert.match(log, /the rules library started in \d+[.]\d s/);
  const holders = await readdir(join(world.settings.lockDir, 'holders'));
  assert.equal(holders.length, 1);
  const holder = JSON.parse(await readFile(join(world.settings.lockDir, 'holders', holders[0]), 'utf8'));
  assert.deepEqual([holder.pid, holder.label, holder.root], [OWN_PID, 'claude-seo-audit', 'D:/site15']);
  assert.ok(!existsSync(join(world.settings.lockDir, 'transition.lock')), 'the transition lock is let go');
});

test('a library that answers is not started again', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0 });
  const lease = await world.library().acquire();
  assert.deepEqual([lease.ok, lease.started], [true, false]);
  // It only looks at its services: nothing is launched or brought up.
  assert.deepEqual(world.calls.filter((call) => !/ config --services$| ps --services --status running$/.test(call)), []);
});

test('a library whose initialize answers with services stopped behind it is brought up again (2026-11-18: elasticsearch, mysql and ragflow stopped by hand)', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0, stopped: ['es01', 'mysql', 'ragflow-cpu'] });
  const lease = await world.library().acquire();
  assert.equal(lease.ok, true, lease.detail);
  assert.ok(world.calls.some((call) => / up -d$/.test(call)), 'compose up');
  assert.deepEqual(world.state.stopped, []);
  assert.match(world.lines.join('\n'), /services are not running \(es01, mysql, ragflow-cpu\): compose up/);
  assert.ok(!world.calls.some((call) => call.startsWith('launch')), 'Docker Desktop was running: not launched');
});

test('a stale socket: Docker Desktop is stopped, its run folders renamed (never deleted), and it is launched again', async () => {
  const world = await machine({ staleFirst: true });
  for (const dir of world.settings.staleDirs) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'docker_engine.sock'), 'x'); }
  const lease = await world.library().acquire();
  assert.equal(lease.ok, true, lease.detail);
  assert.equal(world.calls.filter((call) => call.startsWith('launch')).length, 2);
  assert.ok(world.calls.includes('docker.exe desktop stop --timeout 180'));
  for (const dir of world.settings.staleDirs) {
    assert.ok(!existsSync(dir), `${dir} is renamed`);
    const names = await readdir(join(dir, '..'));
    const kept = names.find((name) => name.startsWith(`${basename(dir)}.stale-2026111`));
    assert.ok(kept, `a *.stale-<date> folder next to ${dir}`);
    assert.ok(existsSync(join(dir, '..', kept, 'docker_engine.sock')), 'its contents are kept');
  }
  assert.match(world.lines.join('\n'), /stale socket reported .*stale socket C:/);
});

test('two holders: the first to let go leaves the library up, the second stops it and gives the memory back', async () => {
  const world = await machine({ livePids: [OWN_PID, 6000] });
  const first = await world.library(OWN_PID).acquire({ label: 'auditor 1' });
  const second = await world.library(6000).acquire({ label: 'auditor 2' });
  assert.equal(second.started, false, 'the second finds it running');
  world.calls.length = 0;
  const one = await world.library(OWN_PID).release({ id: first.id });
  assert.deepEqual([one.stopped, one.reason, one.holders], [false, 'held', 1]);
  assert.deepEqual(stopCalls(world.calls), []);
  const two = await world.library(6000).release({ id: second.id });
  assert.deepEqual([two.stopped, two.reason, two.warnings], ['docker', 'unused', []]);
  assert.deepEqual(stopCalls(world.calls), [`docker.exe compose -p google-search-knowledge -f ${world.settings.compose.file} ${profiles(world)} stop`, 'docker.exe desktop stop --timeout 180', 'wsl.exe --shutdown']);
  assert.match(world.lines.join('\n'), /wsl --shutdown: done/);
});

test('a holder or a transition lock left by a crashed process is stale and does not keep the library up', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0 });
  const holders = join(world.settings.lockDir, 'holders');
  await mkdir(holders, { recursive: true });
  await writeFile(join(holders, '4242-1-crash.json'), JSON.stringify({ id: '4242-1-crash', pid: 4242, label: 'claude-seo-audit', since: '2026-11-17T01:00:00Z' }));
  await writeFile(join(world.settings.lockDir, 'transition.lock'), JSON.stringify({ pid: 4243, action: 'start', since: '2026-11-17T01:00:00Z' }));
  const lease = await world.library().acquire();
  assert.equal(lease.ok, true);
  const released = await world.library().release({ id: lease.id });
  assert.equal(released.stopped, 'docker');
  assert.deepEqual(await readdir(holders), []);
  const log = world.lines.join('\n');
  assert.match(log, /stale transition lock removed \(pid 4243 is gone/);
  assert.match(log, /stale holder 4242-1-crash[.]json removed \(pid 4242 is gone/);
});

test('a manual start holds the library until stop', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0 });
  const manual = await world.library().acquire({ persistent: true, label: 'manual' });
  const audit = await world.library().acquire();
  world.alive.delete(OWN_PID);
  assert.equal((await world.library(7000).release({ id: audit.id })).reason, 'held', 'a manual holder has no process to die');
  assert.ok(manual.id.startsWith('manual-'));
  assert.equal((await world.library(7000).release({ manual: true })).stopped, 'docker');
});

test('another container in Docker: only the library is stopped, Docker Desktop stays, and the log says why', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0, others: ['firecrawl-api-1'] });
  const lease = await world.library().acquire();
  const released = await world.library().release({ id: lease.id });
  assert.deepEqual([released.stopped, released.reason], ['library', 'other containers']);
  assert.deepEqual(stopCalls(world.calls), [`docker.exe compose -p google-search-knowledge -f ${world.settings.compose.file} ${profiles(world)} stop`]);
  assert.match(world.lines.join('\n'), /Docker Desktop stays up: 1 container\(s\) outside the rules library run \(firecrawl-api-1\)/);
});

test('another WSL distribution running: Docker Desktop quits, wsl --shutdown is not run', async () => {
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0, distros: ['docker-desktop', 'Ubuntu-24.04'] });
  const released = await world.library().release({ id: (await world.library().acquire()).id });
  assert.deepEqual([released.stopped, released.reason], ['docker', 'other WSL distributions']);
  assert.ok(!world.calls.includes('wsl.exe --shutdown'));
  assert.match(world.lines.join('\n'), /wsl --shutdown not run: other WSL distributions run \(Ubuntu-24[.]04\)/);
  const none = await machine({ engine: true, libraryUp: true, readyAfter: 0, distros: [] });
  assert.equal((await none.library().release({ id: (await none.library().acquire()).id })).reason, 'unused', '"no running distributions" is not a failure');
});

test('a connection from outside (a pipeline on older code, no holder file) keeps everything up: 有外部使用者，暂不关闭', async () => {
  // Owner 2026-11-17 (site15-tapaworks runs its own branch): the lock is not the only check before stopping.
  const outside = [{ localAddress: '127.0.0.1', localPort: 9382, remoteAddress: '127.0.0.1', remotePort: 51000, pid: 34424 }, { localAddress: '127.0.0.1', localPort: 51000, remoteAddress: '127.0.0.1', remotePort: 9382, pid: 9999 }];
  const world = await machine({ engine: true, libraryUp: true, readyAfter: 0, connections: outside });
  const released = await world.library().release({ id: (await world.library().acquire()).id });
  assert.deepEqual([released.stopped, released.reason], [false, 'external']);
  assert.deepEqual(stopCalls(world.calls), []);
  assert.match(world.lines.join('\n'), /有外部使用者，暂不关闭 .*127[.]0[.]0[.]1:9382 from :51000/);
  // This process's own connection (fetch keeps it open a few seconds) is not someone else's.
  const own = [{ localAddress: '127.0.0.1', localPort: 9382, remoteAddress: '127.0.0.1', remotePort: 52000, pid: 34424 }, { localAddress: '127.0.0.1', localPort: 52000, remoteAddress: '127.0.0.1', remotePort: 9382, pid: OWN_PID }];
  assert.deepEqual(externalConnections(own, [9382, 9380], OWN_PID), []);
  assert.equal(externalConnections([...own, ...outside], [9382, 9380], OWN_PID).length, 1);
  const unread = await machine({ engine: true, libraryUp: true, readyAfter: 0 });
  const lib = createRulesLibrary({ settings: unread.settings, exec: async () => ({ code: 0, stdout: '', stderr: '' }), fetch: async () => ({ status: 200, text: async () => '' }), connections: async () => { throw new Error('Get-NetTCPConnection exited 1'); }, log: () => {}, sleep: async () => {} });
  const failed = await lib.release({});
  assert.equal(failed.stopped, false, 'connections that cannot be read keep it up');
  assert.match(failed.warnings[0], /could not be read/);
});

test("Get-NetTCPConnection's JSON: one object, a list, or nothing", () => {
  assert.deepEqual(parseConnections(''), []);
  assert.deepEqual(parseConnections('{"LocalAddress":"127.0.0.1","LocalPort":9382,"RemoteAddress":"127.0.0.1","RemotePort":51000,"OwningProcess":34424}'), [{ localAddress: '127.0.0.1', localPort: 9382, remoteAddress: '127.0.0.1', remotePort: 51000, pid: 34424 }]);
  assert.equal(parseConnections('[{"LocalPort":9382},{"LocalPort":9380}]').length, 2);
});

test('a start that fails is reported, holds nothing, and the audit waits instead of auditing without the library', async () => {
  const world = await machine({ engine: true, composeUpFails: true });
  const lease = await world.library().acquire();
  assert.equal(lease.ok, false);
  assert.match(lease.detail, /docker compose up failed \(exit 1\): Error response from daemon: no such image/);
  assert.deepEqual(await readdir(join(world.settings.lockDir, 'holders')), []);
  assert.match(world.lines.join('\n'), /warn the rules library did not start/);

  const never = await machine();
  const lib = createRulesLibrary({ settings: never.settings, exec: async () => ({ code: 1, stdout: '', stderr: 'engine down' }), launch: async () => ({ ok: true }), fetch: async () => { throw new Error('refused'); }, connections: async () => [], sleep: async (ms) => { never.state.clock += ms; }, now: () => never.state.clock, log: () => {} });
  const timedOut = await lib.acquire();
  assert.match(timedOut.detail, /the Docker engine did not answer docker info within 240[.]0 s/);

  const { claudeSeoAudit, openRules } = await import('../claude-seo-audit.mjs');
  const root = await mkdtemp(join(tmpdir(), 'rules-audit-'));
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'claude-seo/skills/seo-audit'), { recursive: true });
  await mkdir(join(root, 'claude-seo/agents'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<main><h1>x</h1></main>');
  await writeFile(join(root, 'site.json'), JSON.stringify({ siteKind: 'a factory' }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'home', route: '/', pageType: 'home', status: 'authored', seo: { title: 'Home', description: 'd', canonical: '/' }, blocks: [] }]));
  await writeFile(join(root, 'claude-seo/skills/seo-audit/SKILL.md'), 'skill');
  for (const name of ['seo-technical', 'seo-content', 'seo-schema', 'seo-sitemap', 'seo-geo', 'seo-agentic', 'seo-sxo', 'seo-performance', 'seo-visual']) await writeFile(join(root, 'claude-seo/agents', `${name}.md`), name);
  const failing = await machine({ engine: true, composeUpFails: true });
  const deps = { settings: failing.settings, exec: async (file, args) => (args[0] === 'compose' && args.at(-2) === 'up' ? { code: 1, stdout: '', stderr: 'no such image' } : { code: 0, stdout: '', stderr: '' }), fetch: async () => { throw new Error('refused'); }, connections: async () => [], log: () => {}, sleep: async () => {} };
  const judge = async () => { throw new Error('the audit must not run without the library'); };
  const result = await claudeSeoAudit({ root, judge, verifyJudge: judge, measure: judge, probe: () => openRules('http://127.0.0.1:9382/mcp', deps), env: { CLAUDE_SEO_DIR: join(root, 'claude-seo') }, date: '2026-11-17' });
  assert.equal(result.failed, 'unavailable', 'exit 2: the step waits');
  assert.match(result.detail, /does not answer: it could not be started: docker compose up failed/);
});

test('an address other than the configured library is neither started nor stopped here', async () => {
  const opened = await openRulesLibrary({ url: 'http://10.0.0.5:9382/mcp', deps: { exec: async () => { throw new Error('no command'); }, log: () => {} } });
  assert.deepEqual(opened, { ok: true, managed: false });
  assert.deepEqual(await closeRulesLibrary(), []);
});

test("Docker Desktop's own words for a stale socket are recognised (2026-11-17, after wsl --shutdown)", async () => {
  const { readFile: read } = await import('node:fs/promises');
  const config = JSON.parse(await read('config/rules-library.json', 'utf8'));
  const stale = new RegExp(config.staleSocketPattern, 'i');
  const seen = '[2026-11-17T06:13:04.641784900Z][com.docker.backend.exe] backend cancelling with error: starting services: initializing Ingest server: listening on unix://C:/Users/x/AppData/Local/Docker/run/sailor-ingest.sock: remove C:/Users/x/AppData/Local/Docker/run/sailor-ingest.sock: The file cannot be accessed by the system.';
  assert.match(seen, stale);
  assert.doesNotMatch('[2026-11-17T06:13:05.646682100Z][com.docker.backend.exe.ipc][W] GET /ping: open \\.\pipe\dockerVolumeContents: The system cannot find the file specified.', stale, 'an engine still starting is not a stale socket');
});

test('a stale socket and a Docker Desktop that does not stop: its processes are ended, its run folders renamed, and it is launched again (2026-11-17)', async () => {
  const world = await machine({ staleFirst: true, desktopStopFails: true });
  for (const dir of world.settings.staleDirs) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'sailor-ingest.sock'), 'x'); }
  const held = await world.library().acquire({ label: 'audit' });
  assert.equal(held.ok, true, held.detail);
  assert.ok(world.calls.includes('taskkill.exe /F /T /IM Docker Desktop.exe /IM com.docker.backend.exe /IM docker-desktop.exe'));
  for (const dir of world.settings.staleDirs) assert.equal(existsSync(join(dir, 'sailor-ingest.sock')), false);
  assert.equal(world.state.launches, 2);
});

test('the sockets Docker Desktop leaves are renamed when it is stopped, so the next start finds none (2026-11-17)', async () => {
  const world = await machine();
  const held = await world.library().acquire({ label: 'audit' });
  for (const dir of world.settings.staleDirs) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'sailor-ingest.sock'), 'x'); }
  const empty = join(world.env.LOCALAPPDATA, 'Docker/run');
  const released = await world.library().release({ id: held.id });
  assert.deepEqual([released.stopped, released.warnings], ['docker', []]);
  for (const dir of world.settings.staleDirs) {
    assert.equal(existsSync(join(dir, 'sailor-ingest.sock')), false);
    assert.ok((await readdir(join(dir, '..'))).some((name) => name.startsWith(`${basename(dir)}.stale-`)));
  }
  // An empty run folder is left as it is.
  const again = await world.library().acquire({ label: 'audit' });
  await mkdir(empty, { recursive: true });
  const before = (await readdir(join(empty, '..'))).length;
  await world.library().release({ id: again.id });
  assert.equal((await readdir(join(empty, '..'))).length, before);
});

test('an engine that never answers after a launch (Docker Desktop left hanging) is recovered as a stale socket is (2026-11-17)', async () => {
  const world = await machine({ hungFirst: true, desktopStopFails: true });
  const held = await world.library().acquire({ label: 'audit' });
  assert.equal(held.ok, true, held.detail);
  assert.ok(world.calls.some((call) => call.startsWith('taskkill.exe /F /T')));
  assert.equal(world.state.launches, 2);
  assert.match(world.lines.join('\n'), /no engine \(the Docker engine did not answer/);
});

test("Firecrawl is held the library's way with its own compose, services and lock folder, probed by a plain request (2026-11-18)", async () => {
  const { FIRECRAWL } = await import('../lib/rules-library.mjs');
  const env = { LOCALAPPDATA: 'C:/x/local', USERPROFILE: 'C:/x/user' };
  const settings = librarySettings(env, FIRECRAWL);
  assert.equal(settings.probe, 'http');
  assert.equal(settings.name, 'Firecrawl');
  assert.equal(settings.compose.project, 'firecrawl');
  assert.equal(settings.compose.files.length, 2, 'the compose file and its override');
  assert.deepEqual(settings.services, ['api', 'playwright-service', 'redis', 'rabbitmq', 'nuq-postgres']);
  assert.notEqual(settings.lockDir, librarySettings(env).lockDir, 'its holders apart from the library\'s');
  assert.equal(settings.docker, librarySettings(env).docker, 'the same Docker Desktop');
});

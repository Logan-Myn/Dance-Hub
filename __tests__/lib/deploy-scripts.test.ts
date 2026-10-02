/**
 * Deploy scripts (deploy.sh, deploy-preprod.sh, stripe-mode.sh, deploy/lib.sh).
 * pm2, bun, ss and sudo are replaced by stubs in a temp dir, so nothing here
 * touches a real app, port, nginx or env file.
 *
 * @jest-environment node
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const LIB = path.join(ROOT, 'deploy/lib.sh');
const SCRIPTS = ['deploy.sh', 'deploy-preprod.sh', 'stripe-mode.sh', 'deploy/lib.sh', 'deploy/nginx/update-cloudflare-ips.sh'];

let tmp: string;

function run(cmd: string, args: string[], opts: { env?: Record<string, string>; cwd?: string } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? tmp,
    env: { ...process.env, ...opts.env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

function bash(script: string, env: Record<string, string> = {}) {
  return run('bash', ['-c', script], { env });
}

function write(file: string, content: string, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-scripts-'));
});

afterAll(() => {
  // Stop the stand-in "servers" the pm2 stub started.
  const state = path.join(tmp, 'state');
  if (fs.existsSync(state)) {
    for (const f of fs.readdirSync(state).filter((n) => n.endsWith('.pid'))) {
      try {
        process.kill(Number(fs.readFileSync(path.join(state, f), 'utf8')));
      } catch {
        // already gone
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

it('every deploy script parses', () => {
  for (const s of SCRIPTS) {
    expect(run('bash', ['-n', path.join(ROOT, s)])).toEqual({ code: 0, out: '' });
  }
});

describe('stripe_key_mode', () => {
  const mode = (line: string) => {
    const file = path.join(tmp, 'key.env');
    write(file, `${line}\n`);
    return bash(`source "${LIB}"; stripe_key_mode "${file}"`).out.trim();
  };

  it('prints only the key prefix, never characters of the key', () => {
    expect(mode('STRIPE_SECRET_KEY="sk_live_SECRETPART123"')).toBe('sk_live');
    expect(mode("STRIPE_SECRET_KEY='sk_test_SECRETPART123'")).toBe('sk_test');
    expect(mode('export STRIPE_SECRET_KEY=rk_live_SECRETPART123')).toBe('rk_live');
    expect(mode('STRIPE_SECRET_KEY="SECRETPART123"')).toBe('unknown');
    expect(mode('# STRIPE_SECRET_KEY="sk_live_SECRETPART123"')).toBe('unknown');
  });
});

describe('stripe_env_merge', () => {
  it('swaps only the Stripe lines and keeps everything else (e.g. DATABASE_URL)', () => {
    const src = path.join(tmp, 'merge/.env.preprod.live');
    const dest = path.join(tmp, 'merge/.env.preprod');
    write(
      src,
      [
        'DATABASE_URL="postgres://stale-neon"',
        'STRIPE_SECRET_KEY="sk_live_A"',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_A"',
        'STRIPE_WEBHOOK_SECRET="whsec_live"',
        'STRIPE_NEW_KEY="new"',
        '',
      ].join('\n')
    );
    write(
      dest,
      [
        '# preprod',
        'DATABASE_URL="postgres://127.0.0.1/dance_hub_preprod"',
        'STRIPE_SECRET_KEY="sk_test_B"',
        'STRIPE_WEBHOOK_SECRET="whsec_test"',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_B"',
        'OTHER=1',
        '',
      ].join('\n'),
      0o640
    );
    expect(bash(`source "${LIB}"; stripe_env_merge "${src}" "${dest}"`).code).toBe(0);
    expect(fs.readFileSync(dest, 'utf8')).toBe(
      [
        '# preprod',
        'DATABASE_URL="postgres://127.0.0.1/dance_hub_preprod"',
        'STRIPE_SECRET_KEY="sk_live_A"',
        'STRIPE_WEBHOOK_SECRET="whsec_live"',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_A"',
        'OTHER=1',
        'STRIPE_NEW_KEY="new"',
        '',
      ].join('\n')
    );
    expect(fs.statSync(dest).mode & 0o777).toBe(0o640);
  });
});

describe('stripe-mode.sh status', () => {
  it('reports the preprod env mode without printing the key', () => {
    const repo = path.join(tmp, 'status-repo');
    write(path.join(repo, '.env.preprod'), 'STRIPE_SECRET_KEY="sk_live_SECRETPART123"\n');
    write(path.join(tmp, 'status-bin/ss'), '#!/bin/sh\nexit 0\n', 0o755);
    const res = run(path.join(ROOT, 'stripe-mode.sh'), [], {
      env: {
        DEPLOY_MAIN_REPO: repo,
        DEPLOY_RELEASES_ROOT: path.join(tmp, 'status-releases'),
        PATH: `${path.join(tmp, 'status-bin')}:${process.env.PATH}`,
      },
    });
    expect(res.code).toBe(1);
    expect(res.out).toContain('sk_live');
    expect(res.out).not.toContain('SECRETPART');
  });
});

describe('prod deploy refuses until nginx has the real-IP setup', () => {
  const vhost = () => path.join(tmp, 'precheck/dance-hub.io');
  const prod = (args: string[], extra: Record<string, string> = {}) =>
    run(path.join(ROOT, 'deploy.sh'), args, {
      env: {
        DEPLOY_NGINX_CONF: vhost(),
        // Not a git repo: if the check let `code` through, the pull would fail.
        DEPLOY_MAIN_REPO: path.join(tmp, 'precheck/not-a-repo'),
        DEPLOY_RELEASES_ROOT: path.join(tmp, 'precheck/releases'),
        ...extra,
      },
    });
  const template = () => run(path.join(ROOT, 'deploy.sh'), ['nginx-config'], {
    env: { DEPLOY_RELEASES_ROOT: path.join(tmp, 'precheck/releases') },
  }).out;
  // The live vhost before the change: no include, X-Forwarded-For appended.
  const oldVhost = () =>
    template()
      .replace(/^\s*include \/etc\/nginx\/snippets\/cloudflare-real-ip\.conf;\n/m, '')
      .replace('X-Forwarded-For $remote_addr;', 'X-Forwarded-For $proxy_add_x_forwarded_for;');

  it('refuses `code` and `rebuild` without the include, before touching git', () => {
    write(vhost(), oldVhost());
    for (const cmd of ['code', 'rebuild']) {
      const res = prod([cmd]);
      expect(res.code).toBe(1);
      expect(res.out).toContain('deploy/nginx/README.md');
      expect(res.out).not.toContain('Pulling');
    }
  });

  it('refuses when the include is there but X-Forwarded-For is still appended', () => {
    write(vhost(), template().replace('X-Forwarded-For $remote_addr;', 'X-Forwarded-For $proxy_add_x_forwarded_for;'));
    expect(prod(['rebuild']).out).toContain('deploy/nginx/README.md');
  });

  it('lets the deploy go on once the vhost has it, or with SKIP_NGINX_CHECK=1', () => {
    write(vhost(), template());
    // Past the check, `rebuild` stops only because there is no release yet.
    expect(prod(['rebuild']).out).toContain('No current release of dance-hub to rebuild.');

    write(vhost(), oldVhost());
    const skipped = prod(['rebuild'], { SKIP_NGINX_CHECK: '1' });
    expect(skipped.out).toContain('SKIP_NGINX_CHECK=1');
    expect(skipped.out).toContain('No current release of dance-hub to rebuild.');
  });
});

describe('nginx templates', () => {
  const render = (script: string) =>
    run(path.join(ROOT, script), ['nginx-config'], {
      env: { DEPLOY_RELEASES_ROOT: path.join(tmp, 'nginx-releases') },
    });

  it('prod: TLS with the Cloudflare origin cert, 100m bodies, real visitor IP only', () => {
    const { code, out } = render('deploy.sh');
    expect(code).toBe(0);
    expect(out).toContain('return 301 https://dance-hub.io$request_uri;');
    expect(out).toContain('listen 443 ssl;');
    expect(out).toContain('ssl_certificate /etc/ssl/cloudflare/dance-hub.io.pem;');
    expect(out).toContain('ssl_certificate_key /etc/ssl/cloudflare/dance-hub.io.key;');
    expect(out).toContain('client_max_body_size 100m;');
    expect(out).toContain('include /etc/nginx/snippets/cloudflare-real-ip.conf;');
    expect(out).toContain('proxy_set_header X-Real-IP $remote_addr;');
    expect(out).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(out).not.toContain('$proxy_add_x_forwarded_for');
  });

  it('preprod: same proxy headers, no Cloudflare include', () => {
    const { code, out } = render('deploy-preprod.sh');
    expect(code).toBe(0);
    expect(out).toContain('ssl_certificate /etc/letsencrypt/live/preprod.dance-hub.io/fullchain.pem;');
    expect(out).toContain('client_max_body_size 100m;');
    expect(out).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(out).not.toContain('$proxy_add_x_forwarded_for');
    expect(out).not.toContain('cloudflare-real-ip');
  });
});

describe('Cloudflare real-IP include', () => {
  const directives = (conf: string) =>
    conf
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

  it('the committed file trusts CF-Connecting-IP only from Cloudflare ranges', () => {
    const lines = directives(fs.readFileSync(path.join(ROOT, 'deploy/nginx/cloudflare-real-ip.conf'), 'utf8'));
    const ranges = lines.filter((l) => l.startsWith('set_real_ip_from '));
    expect(ranges.filter((l) => l.includes('.')).length).toBeGreaterThanOrEqual(10);
    expect(ranges.filter((l) => l.includes(':')).length).toBeGreaterThanOrEqual(5);
    for (const r of ranges) {
      expect(r).toMatch(/^set_real_ip_from (\d{1,3}(\.\d{1,3}){3}\/\d{1,2}|[0-9a-f:]+\/\d{1,3});$/);
    }
    expect(lines.filter((l) => !l.startsWith('set_real_ip_from '))).toEqual([
      'real_ip_header CF-Connecting-IP;',
      'real_ip_recursive off;',
    ]);
  });

  it('the generator refuses a list that is not CIDRs', () => {
    const v4 = path.join(tmp, 'cf/v4');
    const v6 = path.join(tmp, 'cf/v6');
    const out = path.join(tmp, 'cf/out.conf');
    write(v6, '2400:cb00::/32\n2606:4700::/32\n2803:f800::/32');
    const gen = () =>
      run(path.join(ROOT, 'deploy/nginx/update-cloudflare-ips.sh'), [out], {
        env: { CLOUDFLARE_IPS_V4_URL: `file://${v4}`, CLOUDFLARE_IPS_V6_URL: `file://${v6}` },
      });

    write(v4, '<html>error</html>\n1.2.3.0/24\n5.6.7.0/24');
    expect(gen().code).not.toBe(0);
    expect(fs.existsSync(out)).toBe(false);

    write(v4, '173.245.48.0/20\n103.21.244.0/22\n103.22.200.0/22');
    expect(gen().code).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toContain('set_real_ip_from 103.22.200.0/22;\n');
  });
});

describe('release directories', () => {
  let repo: string;
  let releases: string;
  let env: Record<string, string>;

  const preprod = (...args: string[]) => run(path.join(ROOT, 'deploy-preprod.sh'), args, { env });
  const current = () => fs.readlinkSync(path.join(releases, 'current'));
  const releaseNames = () =>
    fs
      .readdirSync(releases)
      .filter((n) => /^\d/.test(n))
      .sort();
  const servedFrom = () => {
    const pid = fs.readFileSync(path.join(tmp, 'state/dance-hub-preprod.pid'), 'utf8').trim();
    return fs.realpathSync(`/proc/${pid}/cwd`);
  };

  beforeAll(() => {
    const bin = path.join(tmp, 'bin');
    // pm2: runs a `sleep` with the requested cwd so /proc/<pid>/cwd is real.
    write(
      path.join(bin, 'pm2'),
      `#!/usr/bin/env bash
ST="$STUB_STATE"; mkdir -p "$ST"
case "$1" in
  start) shift; script="$1"; shift
    while [[ $# -gt 0 ]]; do case "$1" in --name) name="$2"; shift 2;; --cwd) cwd="$2"; shift 2;; --) shift; break;; *) shift;; esac; done
    [[ -f "$script" ]] || exit 1
    (cd "$cwd" && exec sleep 300) </dev/null >/dev/null 2>&1 &
    echo $! > "$ST/$name.pid";;
  delete) [[ -f "$ST/$2.pid" ]] || exit 1; kill "$(cat "$ST/$2.pid")" 2>/dev/null; rm -f "$ST/$2.pid";;
  pid) cat "$ST/$2.pid" 2>/dev/null || true;;
  save|status) ;;
  *) exit 2;;
esac
`,
      0o755
    );
    write(
      path.join(bin, 'ss'),
      `#!/usr/bin/env bash
for f in "$STUB_STATE"/*.pid; do [[ -f "$f" ]] && echo "LISTEN 0 511 *:3009 *:* users:((\\"next-server\\",pid=$(cat "$f"),fd=21))"; done
`,
      0o755
    );
    write(
      path.join(bin, 'bun'),
      `#!/usr/bin/env bash
case "$1 $2" in
  "install --frozen-lockfile") mkdir -p node_modules/next/dist/bin && touch node_modules/next/dist/bin/next;;
  "run build") [[ -f "$STUB_FAIL_BUILD" ]] && exit 1; mkdir -p .next && echo ok > .next/BUILD_ID;;
  *) exit 2;;
esac
`,
      0o755
    );
    write(path.join(bin, 'sudo'), '#!/bin/sh\necho "sudo must not be called" >&2\nexit 99\n', 0o755);

    const origin = path.join(tmp, 'origin.git');
    repo = path.join(tmp, 'repo');
    releases = path.join(tmp, 'releases/dance-hub-preprod');
    const git = (...args: string[]) => {
      const res = run('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args]);
      if (res.code !== 0) throw new Error(res.out);
    };
    git('init', '-q', '--bare', '-b', 'main', origin);
    git('init', '-q', '-b', 'main', repo);
    write(path.join(repo, 'package.json'), '{}\n');
    write(path.join(repo, '.gitignore'), '.env*\n');
    git('-C', repo, 'add', '-A');
    git('-C', repo, 'commit', '-qm', 'init');
    git('-C', repo, 'remote', 'add', 'origin', origin);
    git('-C', repo, 'push', '-q', 'origin', 'main');
    write(path.join(repo, '.env.preprod'), 'STRIPE_SECRET_KEY="sk_test_x"\n');

    env = {
      PATH: `${bin}:${process.env.PATH}`,
      STUB_STATE: path.join(tmp, 'state'),
      STUB_FAIL_BUILD: path.join(tmp, 'FAIL_BUILD'),
      DEPLOY_MAIN_REPO: repo,
      DEPLOY_RELEASES_ROOT: path.join(tmp, 'releases'),
      DEPLOY_PORT_CHECK_TIMEOUT: '6',
    };
  });

  it('builds a release, switches `current` to it and serves from there', () => {
    const res = preprod('restart', 'main');
    expect(res.code).toBe(0);
    expect(releaseNames()).toHaveLength(1);
    expect(current()).toBe(releaseNames()[0]);
    expect(servedFrom()).toBe(fs.realpathSync(path.join(releases, current())));
    const info = fs.readFileSync(path.join(releases, current(), '.release-info'), 'utf8');
    expect(info).toContain('ref=origin/main');
    // The env file is copied in, never linked or moved.
    expect(fs.readFileSync(path.join(releases, current(), '.env.local'), 'utf8')).toBe('STRIPE_SECRET_KEY="sk_test_x"\n');
    expect(fs.existsSync(path.join(repo, '.env.preprod'))).toBe(true);
  }, 60_000);

  it('a failed build leaves the running release alone', () => {
    const before = current();
    const servedBefore = servedFrom();
    write(env.STUB_FAIL_BUILD, '');
    const res = preprod('restart', 'main');
    fs.rmSync(env.STUB_FAIL_BUILD);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('Build failed. The running release was not touched.');
    expect(current()).toBe(before);
    expect(servedFrom()).toBe(servedBefore);
    expect(releaseNames()).toEqual([before]);
  }, 60_000);

  it('keeps the newest 3 releases and rolls back to the previous one', () => {
    for (let i = 0; i < 3; i++) {
      // Release names have one-second resolution.
      spawnSync('sleep', ['1.1']);
      expect(preprod('restart', 'main').code).toBe(0);
    }
    const names = releaseNames();
    expect(names).toHaveLength(3);
    expect(current()).toBe(names[2]);

    expect(preprod('rollback').code).toBe(0);
    expect(current()).toBe(names[1]);
    expect(servedFrom()).toBe(fs.realpathSync(path.join(releases, names[1])));

    expect(preprod('rollback', names[2]).code).toBe(0);
    expect(current()).toBe(names[2]);
    expect(preprod('rollback', 'current').code).not.toBe(0);
    expect(current()).toBe(names[2]);
  }, 120_000);

  it('rollback warns (by key name only) when the release env differs from the env file', () => {
    const envFile = path.join(repo, '.env.preprod');
    const original = fs.readFileSync(envFile, 'utf8');
    const target = releaseNames()[1];
    expect(current()).not.toBe(target);

    fs.writeFileSync(envFile, 'STRIPE_SECRET_KEY="sk_live_CHANGEDVALUE"\nNEW_FLAG="on"\n');
    const res = preprod('rollback', target);
    fs.writeFileSync(envFile, original);

    expect(res.code).toBe(0);
    expect(current()).toBe(target);
    expect(res.out).toContain('env differs: NEW_FLAG, STRIPE_SECRET_KEY');
    expect(res.out).not.toMatch(/CHANGEDVALUE|sk_test_x|"on"/);

    // Same env: no warning.
    expect(preprod('rollback', releaseNames()[2]).out).not.toContain('env differs');
  }, 60_000);
});

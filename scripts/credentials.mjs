import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class SkillError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export function validateKey(value) {
  // Opaque to the client; permit both legacy and current server-issued keys.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{16,512}$/.test(value)) {
    throw new SkillError('INVALID_KEY', 'Copy the API Key from Anke Money; spaces and control characters are not accepted.');
  }
  return value;
}

// Never use a shell, put a Key in argv, or forward native diagnostic output.
function runNative(command, args, input = '') {
  const result = spawnSync(command, args, {
    input, encoding: 'utf8', windowsHide: true, timeout: 60000,
    maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout || '', hadStderr: Boolean(result.stderr), failed: Boolean(result.error) };
}

export function createVault({ platform = process.platform, run = runNative,
  target = 'com.anke.money.skill.api-key', systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (!/^[a-zA-Z0-9.-]{1,200}$/.test(target)) throw new SkillError('VAULT_TARGET', 'Invalid credential target.');
  const account = 'anke-money-agent';
  const windowsScript = () => readFileSync(new URL('./windows-vault.ps1', import.meta.url), 'utf8');
  const unavailable = () => new SkillError('VAULT_UNAVAILABLE',
    'Unlock the system credential store. Linux needs secret-tool and a Secret Service session; Windows needs Windows PowerShell. A headless/cloud host can use its secret setting ANKE_MONEY_API_KEY. No plaintext fallback is used.');

  function invoke(action, key = '') {
    if (platform === 'darwin') {
      if (action === 'write') {
        // security's interactive parser receives the secret over a private pipe.
        // validateKey excludes quotes, whitespace and command separators.
        return run('/usr/bin/security', ['-i'],
          `add-generic-password -U -a ${account} -s ${target} -w ${validateKey(key)}\n`);
      }
      const verb = action === 'read' ? 'find-generic-password' : 'delete-generic-password';
      return run('/usr/bin/security', [verb, '-a', account, '-s', target, ...(action === 'read' ? ['-w'] : [])]);
    }
    if (platform === 'linux') {
      const verb = { read: 'lookup', write: 'store', delete: 'clear' }[action];
      return run('secret-tool', [verb, ...(action === 'write' ? ['--label=Anke Money Skill'] : []),
        'service', target, 'account', account], action === 'write' ? validateKey(key) : '');
    }
    if (platform === 'win32') {
      const script = windowsScript().replace('__ACTION__', action).replace('__TARGET__', target);
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      return run(`${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], key);
    }
    throw unavailable();
  }

  return {
    name: { darwin: 'macOS Keychain', win32: 'Windows Credential Manager', linux: 'Linux Secret Service' }[platform] || 'unavailable',
    read() {
      const result = invoke('read');
      if (result.failed) throw unavailable();
      if ((platform === 'darwin' && result.status === 44) ||
          (platform === 'win32' && result.status === 42) ||
          (platform === 'linux' && result.status === 1 && !result.hadStderr)) return null;
      if (result.status !== 0) throw unavailable();
      const key = result.stdout.trim();
      return key ? validateKey(key) : null;
    },
    write(key) {
      validateKey(key);
      const result = invoke('write', key);
      if (result.failed || result.status !== 0) throw unavailable();
      // security -i can exit successfully even when its inner command fails.
      if (this.read() !== key) throw new SkillError('VAULT_SAVE_FAILED', 'The credential store did not confirm saving the Key. Existing credentials were not deliberately removed.');
    },
    remove() {
      const result = invoke('delete');
      if (result.failed || ![0, 44, 42].includes(result.status)) throw unavailable();
    },
  };
}

export async function promptKey(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new SkillError('TERMINAL_REQUIRED',
      `Open a real terminal and run: node "${fileURLToPath(new URL('./anke-money.mjs', import.meta.url))}" setup. Paste the Key only into that hidden prompt, never into chat or a command argument.`);
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = Boolean(input.isRaw);
    const finish = (error) => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.removeListener('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      error ? reject(error) : resolve(value);
      value = '';
    };
    const cancel = () => new SkillError('CANCELLED', 'Setup cancelled; no new Key was saved.');
    const onEnd = () => finish(cancel());
    const onError = () => finish(cancel());
    const onData = (data) => {
      // Ignore bracketed-paste delimiters; never echo input, even as masking dots.
      const text = data.toString('utf8').replace(/\x1b\[20[01]~/g, '');
      for (const character of text) {
        if (character === '\u0003' || character === '\u0004') return finish(cancel());
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
        if (value.length > 512) return finish(new SkillError('INVALID_KEY', 'Key is too long; no Key was saved.'));
      }
    };
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onError);
    output.write('Paste API Key / 粘贴 API Key（输入隐藏）, then Enter: ');
    input.resume();
  });
}

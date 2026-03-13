const net = require('node:net');
const os = require('node:os');
const tls = require('node:tls');

const MAILBOX_ADDRESS_PATTERN = /^[^\s<>@,;]+@[^\s<>@,;]+$/;

function assertRequiredText(name, value) {
    const text = String(value || '').trim();
    if (!text) {
        throw new Error(`${name} 不能为空`);
    }
    return text;
}

function normalizePort(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) return parsed;
    return fallback;
}

function encodeHeaderText(value) {
    const text = String(value || '');
    if (!text) return '';
    return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function toBase64Lines(text) {
    const encoded = Buffer.from(String(text || ''), 'utf8').toString('base64');
    return encoded.replace(/.{1,76}/g, line => `${line}\r\n`);
}

function normalizeSmtpLine(line) {
    return String(line || '').replace(/\r?\n/g, '\r\n');
}

function createMimeBoundary() {
    return `----=_QQFarmBot_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function parseRecipients(value) {
    return Array.from(new Set(
        String(value || '')
            .split(/[\n,;]+/)
            .map(item => String(item || '').trim())
            .filter(Boolean),
    ));
}

function assertMailboxAddress(name, value) {
    const text = String(value || '').trim();
    if (!text) {
        throw new Error(`${name} 不能为空`);
    }
    if (!MAILBOX_ADDRESS_PATTERN.test(text)) {
        throw new Error(`${name} 格式无效，请填写纯邮箱地址，例如 bot@example.com`);
    }
    return text;
}

function normalizeEhloName(value) {
    const ascii = String(value || '')
        .normalize('NFKD')
        .replace(/[^\x00-\x7F]/g, '')
        .toLowerCase();
    const labels = ascii
        .split('.')
        .map(label => label
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 63))
        .filter(Boolean);
    let host = labels.join('.');
    if (!host) {
        return 'localhost.localdomain';
    }
    if (!host.includes('.')) {
        host = `${host}.localdomain`;
    }
    if (host.length > 253) {
        host = host.slice(0, 253).replace(/[.-]+$/g, '');
    }
    return host || 'localhost.localdomain';
}

function createReader(socket) {
    const state = {
        socket,
        buffer: '',
        current: null,
        queued: [],
        pending: [],
        closed: false,
    };

    function settleError(error) {
        state.closed = true;
        while (state.pending.length > 0) {
            const current = state.pending.shift();
            clearTimeout(current.timer);
            current.reject(error);
        }
    }

    function flushResponse(response) {
        if (state.pending.length > 0) {
            const current = state.pending.shift();
            clearTimeout(current.timer);
            current.resolve(response);
            return;
        }
        state.queued.push(response);
    }

    function consumeLine(rawLine) {
        const line = String(rawLine || '').replace(/\r$/, '');
        const match = /^(\d{3})([ -])(.*)$/.exec(line);
        if (!match) {
            if (state.current) state.current.lines.push(line);
            return;
        }
        const [, code, flag, message] = match;
        if (!state.current || state.current.code !== code) {
            state.current = { code: Number(code), lines: [] };
        }
        state.current.lines.push(message);
        if (flag === ' ') {
            flushResponse({
                code: state.current.code,
                lines: state.current.lines.slice(),
                message: state.current.lines.join('\n'),
            });
            state.current = null;
        }
    }

    function onData(chunk) {
        state.buffer += chunk.toString('utf8');
        let lineBreakIndex = state.buffer.indexOf('\n');
        while (lineBreakIndex >= 0) {
            const line = state.buffer.slice(0, lineBreakIndex);
            state.buffer = state.buffer.slice(lineBreakIndex + 1);
            consumeLine(line);
            lineBreakIndex = state.buffer.indexOf('\n');
        }
    }

    socket.on('data', onData);
    socket.on('error', settleError);
    socket.on('close', () => settleError(new Error('SMTP 连接已关闭')));
    socket.on('end', () => settleError(new Error('SMTP 连接已结束')));

    return {
        async readResponse(timeoutMs = 15000) {
            if (state.queued.length > 0) {
                return state.queued.shift();
            }
            if (state.closed) {
                throw new Error('SMTP 连接不可用');
            }
            return await new Promise((resolve, reject) => {
                const entry = { resolve, reject, timer: null };
                entry.timer = setTimeout(() => {
                    const index = state.pending.indexOf(entry);
                    if (index >= 0) state.pending.splice(index, 1);
                    reject(new Error('SMTP 响应超时'));
                }, timeoutMs);
                state.pending.push(entry);
            });
        },
        detach() {
            socket.off('data', onData);
            socket.removeListener('error', settleError);
        },
    };
}

async function connectSocket({ host, port, secure, timeoutMs }) {
    return await new Promise((resolve, reject) => {
        const options = { host, port, timeout: timeoutMs };
        const socket = secure
            ? tls.connect({ ...options, servername: host }, () => resolve(socket))
            : net.createConnection(options, () => resolve(socket));
        socket.once('error', reject);
        socket.once('timeout', () => reject(new Error('SMTP 连接超时')));
    });
}

async function upgradeToTls(socket, host, timeoutMs) {
    return await new Promise((resolve, reject) => {
        const secureSocket = tls.connect({
            socket,
            servername: host,
            timeout: timeoutMs,
        }, () => resolve(secureSocket));
        secureSocket.once('error', reject);
        secureSocket.once('timeout', () => reject(new Error('SMTP TLS 握手超时')));
    });
}

function parseCapabilities(response) {
    const capabilities = new Map();
    for (const rawLine of Array.isArray(response && response.lines) ? response.lines : []) {
        const line = String(rawLine || '').trim();
        if (!line) continue;
        const [key, ...rest] = line.split(/\s+/);
        capabilities.set(String(key || '').toUpperCase(), rest.join(' ').trim());
    }
    return capabilities;
}

async function expectResponse(reader, expectedCodes, timeoutMs, step = '') {
    const response = await reader.readResponse(timeoutMs);
    if (!expectedCodes.includes(response.code)) {
        const prefix = step ? `SMTP 返回异常 (${step}):` : 'SMTP 返回异常:';
        throw new Error(`${prefix} ${response.code} ${response.message || ''}`.trim());
    }
    return response;
}

async function sendCommand(socket, reader, command, expectedCodes, timeoutMs = 15000, step = '') {
    socket.write(`${command}\r\n`);
    return await expectResponse(reader, expectedCodes, timeoutMs, step);
}

async function authenticate(socket, reader, authMethods, username, password) {
    const methods = String(authMethods || '').toUpperCase();
    if (methods.includes('PLAIN')) {
        const payload = Buffer.from(`\u0000${username}\u0000${password}`, 'utf8').toString('base64');
        await sendCommand(socket, reader, `AUTH PLAIN ${payload}`, [235], 15000, 'AUTH PLAIN');
        return;
    }

    await sendCommand(socket, reader, 'AUTH LOGIN', [334], 15000, 'AUTH LOGIN');
    await sendCommand(socket, reader, Buffer.from(username, 'utf8').toString('base64'), [334], 15000, 'AUTH USERNAME');
    await sendCommand(socket, reader, Buffer.from(password, 'utf8').toString('base64'), [235], 15000, 'AUTH PASSWORD');
}

function buildMailMessage({ from, to, subject, content, html }) {
    const recipients = parseRecipients(to);
    const normalizedText = normalizeSmtpLine(content);
    const normalizedHtml = String(html || '').trim();
    const lines = [
        `Date: ${new Date().toUTCString()}`,
        `From: ${from}`,
        `To: ${recipients.join(', ')}`,
        `Subject: ${encodeHeaderText(subject)}`,
        'MIME-Version: 1.0',
    ];

    if (!normalizedHtml) {
        lines.push(
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            toBase64Lines(normalizedText).trimEnd(),
            '',
        );
        return lines.join('\r\n');
    }

    const boundary = createMimeBoundary();
    lines.push(
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        toBase64Lines(normalizedText).trimEnd(),
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        toBase64Lines(normalizeSmtpLine(normalizedHtml)).trimEnd(),
        '',
        `--${boundary}--`,
        '',
    );
    return lines.join('\r\n');
}

function dotStuffMessage(message) {
    return String(message || '')
        .split('\r\n')
        .map(line => (line.startsWith('.') ? `.${line}` : line))
        .join('\r\n');
}

async function sendEmailMessage(payload = {}) {
    const title = assertRequiredText('title', payload.title);
    const content = assertRequiredText('content', payload.content);
    const html = String(payload.html || '').trim();
    const smtpHost = assertRequiredText('smtpHost', payload.smtpHost);
    const smtpSecure = payload.smtpSecure === true || String(payload.smtpSecure || '').toLowerCase() === 'true';
    const smtpPort = normalizePort(payload.smtpPort, smtpSecure ? 465 : 587);
    const smtpUser = String(payload.smtpUser || '').trim();
    const smtpPass = String(payload.smtpPass || '').trim();
    const emailTo = assertRequiredText('emailTo', payload.emailTo);
    const emailFrom = String(payload.emailFrom || smtpUser || '').trim();
    const sender = assertMailboxAddress('emailFrom', emailFrom);
    const recipients = parseRecipients(emailTo).map(item => assertMailboxAddress('emailTo', item));
    if (recipients.length === 0) {
        throw new Error('emailTo 不能为空');
    }

    let socket = null;
    let reader = null;
    const timeoutMs = 15000;
    const clientName = normalizeEhloName(os.hostname() || 'qq-farm-bot');

    try {
        socket = await connectSocket({ host: smtpHost, port: smtpPort, secure: smtpSecure, timeoutMs });
        reader = createReader(socket);

        await expectResponse(reader, [220], timeoutMs, 'GREETING');
        let ehloResponse = await sendCommand(socket, reader, `EHLO ${clientName}`, [250], timeoutMs, 'EHLO');
        let capabilities = parseCapabilities(ehloResponse);

        if (!smtpSecure && capabilities.has('STARTTLS')) {
            await sendCommand(socket, reader, 'STARTTLS', [220], timeoutMs, 'STARTTLS');
            reader.detach();
            socket = await upgradeToTls(socket, smtpHost, timeoutMs);
            reader = createReader(socket);
            ehloResponse = await sendCommand(socket, reader, `EHLO ${clientName}`, [250], timeoutMs, 'EHLO');
            capabilities = parseCapabilities(ehloResponse);
        }

        if (smtpUser) {
            await authenticate(socket, reader, capabilities.get('AUTH') || '', smtpUser, smtpPass);
        }

        await sendCommand(socket, reader, `MAIL FROM:<${sender}>`, [250], timeoutMs, 'MAIL FROM');
        for (const recipient of recipients) {
            await sendCommand(socket, reader, `RCPT TO:<${recipient}>`, [250, 251], timeoutMs, 'RCPT TO');
        }

        await sendCommand(socket, reader, 'DATA', [354], timeoutMs, 'DATA');
        const message = buildMailMessage({ from: sender, to: recipients.join(', '), subject: title, content, html });
        socket.write(`${dotStuffMessage(message)}\r\n.\r\n`);
        const response = await expectResponse(reader, [250], timeoutMs, 'MESSAGE BODY');

        try {
            await sendCommand(socket, reader, 'QUIT', [221], 5000, 'QUIT');
        } catch {
            // ignore quit failure
        }
        socket.end();

        return {
            ok: true,
            code: 'ok',
            msg: response.message || 'ok',
            raw: response,
        };
    } catch (error) {
        if (socket && !socket.destroyed) socket.destroy();
        return {
            ok: false,
            code: 'error',
            msg: error && error.message ? error.message : String(error),
            raw: { error: error && error.message ? error.message : String(error) },
        };
    }
}

module.exports = {
    buildMailMessage,
    normalizeEhloName,
    sendEmailMessage,
};

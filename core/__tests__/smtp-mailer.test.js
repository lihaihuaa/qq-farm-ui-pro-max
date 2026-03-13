const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMailMessage, normalizeEhloName, sendEmailMessage } = require('../src/services/smtp-mailer');

test('buildMailMessage uses multipart alternative when html content is provided', () => {
    const message = buildMailMessage({
        from: 'bot@example.com',
        to: 'user@example.com',
        subject: 'Test Subject',
        content: 'Plain fallback body',
        html: '<strong>Styled body</strong>',
    });

    assert.match(message, /Content-Type: multipart\/alternative; boundary="----=_QQFarmBot_/);
    assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
    assert.match(message, /Content-Type: text\/html; charset=UTF-8/);
    assert.ok(message.includes(Buffer.from('Plain fallback body', 'utf8').toString('base64')));
    assert.ok(message.includes(Buffer.from('<strong>Styled body</strong>', 'utf8').toString('base64')));
});

test('buildMailMessage stays as plain text when html content is missing', () => {
    const message = buildMailMessage({
        from: 'bot@example.com',
        to: 'user@example.com',
        subject: 'Test Subject',
        content: 'Only plain text',
    });

    assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
    assert.doesNotMatch(message, /multipart\/alternative/);
    assert.ok(message.includes(Buffer.from('Only plain text', 'utf8').toString('base64')));
});

test('normalizeEhloName converts hostname to RFC-friendly value', () => {
    assert.equal(normalizeEhloName('DESKTOP_测试机'), 'desktop.localdomain');
    assert.equal(normalizeEhloName('My_PC-01'), 'my-pc-01.localdomain');
});

test('sendEmailMessage rejects display name style sender addresses before connecting', async () => {
    await assert.rejects(
        sendEmailMessage({
            title: 'Test Subject',
            content: 'Body',
            smtpHost: 'smtp.qq.com',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: '123456@qq.com',
            smtpPass: 'auth-code',
            emailFrom: '机器人 <123456@qq.com>',
            emailTo: 'target@example.com',
        }),
        /emailFrom 格式无效/,
    );
});

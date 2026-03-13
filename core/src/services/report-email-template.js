function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatInteger(value) {
    return new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.floor(toNumber(value))));
}

function formatSigned(value) {
    return `+${formatInteger(value)}`;
}

function chunk(items, size) {
    const result = [];
    const normalizedSize = Math.max(1, Math.floor(toNumber(size)) || 1);
    for (let index = 0; index < items.length; index += normalizedSize) {
        result.push(items.slice(index, index + normalizedSize));
    }
    return result;
}

function renderMetricGrid(items, options = {}) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.length === 0) return '';

    const columns = Math.max(1, Math.min(4, Math.floor(toNumber(options.columns)) || 3));
    const cellWidth = `${(100 / columns).toFixed(2)}%`;
    const rows = chunk(list, columns).map((row) => {
        const cells = row.map((item) => {
            const background = String(item.background || '#f5f8fc');
            const valueColor = String(item.valueColor || '#17324d');
            const labelColor = String(item.labelColor || '#6d8095');
            const note = String(item.note || '').trim();
            return `
                <td width="${cellWidth}" style="padding:6px; vertical-align:top;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                        <tr>
                            <td align="center" style="padding:18px 10px; background:${background}; border-radius:16px;">
                                <div style="font-size:30px; line-height:1; font-weight:700; color:${valueColor};">${escapeHtml(item.value)}</div>
                                <div style="margin-top:8px; font-size:13px; line-height:1.5; color:${labelColor};">${escapeHtml(item.label)}</div>
                                ${note ? `<div style="margin-top:4px; font-size:11px; line-height:1.5; color:${labelColor};">${escapeHtml(note)}</div>` : ''}
                            </td>
                        </tr>
                    </table>
                </td>
            `;
        }).join('');

        const paddingCells = new Array(Math.max(0, columns - row.length)).fill(`
            <td width="${cellWidth}" style="padding:6px; vertical-align:top;">&nbsp;</td>
        `).join('');

        return `<tr>${cells}${paddingCells}</tr>`;
    }).join('');

    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${rows}
        </table>
    `;
}

function renderSectionCard(title, subtitle, contentHtml, accentColor = '#1f7dd6') {
    const safeTitle = escapeHtml(title);
    const safeSubtitle = escapeHtml(subtitle || '');
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; background:#ffffff; border:1px solid #e7edf5; border-radius:22px;">
            <tr>
                <td style="padding:18px 22px 12px 22px;">
                    <div style="font-size:16px; line-height:1.4; font-weight:700; color:#17324d;">${safeTitle}</div>
                    ${safeSubtitle ? `<div style="margin-top:4px; font-size:12px; line-height:1.5; color:#73859a;">${safeSubtitle}</div>` : ''}
                </td>
            </tr>
            <tr>
                <td style="padding:0 22px 22px 22px;">
                    <div style="height:4px; width:54px; border-radius:999px; background:${accentColor};"></div>
                    <div style="margin-top:16px;">
                        ${contentHtml}
                    </div>
                </td>
            </tr>
        </table>
    `;
}

function renderMetaPills(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (list.length === 0) return '';
    return list.map(item => `
        <span style="display:inline-block; margin:0 8px 8px 0; padding:6px 12px; border-radius:999px; background:${escapeHtml(item.background || '#ecf5ff')}; color:${escapeHtml(item.color || '#2d5f96')}; font-size:12px; line-height:1.4;">
            ${escapeHtml(item.text)}
        </span>
    `).join('');
}

function renderListLines(lines) {
    const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (list.length === 0) return '<div style="font-size:13px; line-height:1.7; color:#7b8b9b;">暂无补充说明</div>';
    return list.map(line => `
        <div style="font-size:13px; line-height:1.8; color:#536579;">${escapeHtml(line)}</div>
    `).join('');
}

function renderInfoLine(label, value) {
    return `
        <div style="margin-top:8px; font-size:13px; line-height:1.7; color:#5c6d80;">
            <span style="color:#8a9bae;">${escapeHtml(label)}：</span>${escapeHtml(value)}
        </div>
    `;
}

function renderEmailShell({ eyebrow, title, subtitle, bodyHtml, footerText }) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0; padding:0; background:#eef3f8; font-family:'PingFang SC','Microsoft YaHei',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background:#eef3f8;">
        <tr>
            <td align="center" style="padding:28px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px; border-collapse:separate;">
                    <tr>
                        <td style="background:#41b7c6; background-image:linear-gradient(135deg, #41b7c6 0%, #5d79ef 100%); border-radius:26px 26px 0 0; padding:30px 32px 28px 32px; color:#ffffff;">
                            <div style="font-size:12px; line-height:1.4; letter-spacing:1px; text-transform:uppercase; opacity:0.9;">${escapeHtml(eyebrow)}</div>
                            <div style="margin-top:10px; font-size:32px; line-height:1.2; font-weight:700;">${escapeHtml(title)}</div>
                            <div style="margin-top:10px; font-size:14px; line-height:1.7; color:rgba(255,255,255,0.92);">${subtitle}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#ffffff; border-radius:0 0 26px 26px; padding:26px 18px 18px 18px; box-shadow:0 18px 45px rgba(30, 59, 98, 0.08);">
                            ${bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:22px 16px 6px 16px; font-size:12px; line-height:1.8; color:#8b98a8;">
                            ${escapeHtml(footerText)}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function buildOperationItems(operations = {}) {
    const helpTotal = toNumber(operations.helpWater) + toNumber(operations.helpWeed) + toNumber(operations.helpBug);
    return [
        { label: '收获', value: formatInteger(operations.harvest), background: '#eef8e9', valueColor: '#5da92e' },
        { label: '种植', value: formatInteger(operations.plant), background: '#f2f7ff', valueColor: '#3c7fe6' },
        { label: '浇水', value: formatInteger(operations.water), background: '#eaf8fb', valueColor: '#1c90a8' },
        { label: '除草', value: formatInteger(operations.weed), background: '#f7f4eb', valueColor: '#a77a11' },
        { label: '除虫', value: formatInteger(operations.bug), background: '#fff1ec', valueColor: '#d7663d' },
        { label: '帮忙', value: formatInteger(helpTotal), background: '#eef1ff', valueColor: '#5b61d6' },
    ];
}

function renderReportEmailHtml(data = {}) {
    const accountName = String(data.accountName || '').trim() || '未命名账号';
    const connected = !!data.connected;
    const sentAt = String(data.sentAt || '').trim();
    const panel = (data.panel && typeof data.panel === 'object') ? data.panel : {};
    const diff = (data.diff && typeof data.diff === 'object') ? data.diff : {};
    const farm = (data.farm && typeof data.farm === 'object') ? data.farm : null;
    const bag = (data.bag && typeof data.bag === 'object') ? data.bag : null;
    const friends = (data.friends && typeof data.friends === 'object') ? data.friends : null;
    const notes = Array.isArray(data.notes) ? data.notes : [];

    const rewardCards = [
        { label: '经验收益', value: formatSigned(diff.exp), background: '#f6cb69', valueColor: '#ffffff', labelColor: 'rgba(255,255,255,0.92)' },
        { label: '金币收益', value: formatSigned(diff.gold), background: '#9fc2ea', valueColor: '#16324d', labelColor: '#4d6074' },
        { label: '点券收益', value: formatSigned(diff.coupon), background: '#f1d8c4', valueColor: '#17324d', labelColor: '#765d4d' },
    ];

    const panelCards = [
        { label: '等级', value: `Lv.${formatInteger(panel.level)}`, background: '#ebf7ff', valueColor: '#1576c9' },
        { label: '金币', value: formatInteger(panel.gold), background: '#fff3db', valueColor: '#b17a12' },
        { label: '经验', value: formatInteger(panel.exp), background: '#eff0ff', valueColor: '#4f58cd' },
    ];

    const metaPills = renderMetaPills([
        { text: `账号 ID ${data.accountId || '--'}`, background: '#ecf4ff', color: '#2f68a4' },
        { text: `平台 ${data.platform || '--'}`, background: '#f1f8f4', color: '#2b8260' },
        { text: connected ? '连接状态 在线' : '连接状态 离线', background: connected ? '#ecfbf1' : '#f3f5f7', color: connected ? '#1f8d57' : '#6f7f90' },
    ]);

    const farmContent = farm
        ? renderMetricGrid(farm.metrics, { columns: 3 })
        : '<div style="font-size:13px; line-height:1.7; color:#7b8b9b;">当前未采集到农场详情。</div>';
    const bagContent = bag
        ? renderMetricGrid(bag.metrics, { columns: 2 })
        : '<div style="font-size:13px; line-height:1.7; color:#7b8b9b;">当前未采集到背包详情。</div>';
    const friendLines = [];
    if (friends && Array.isArray(friends.sampleNames) && friends.sampleNames.length > 0) {
        friendLines.push(`好友示例：${friends.sampleNames.join('、')}`);
    }

    const friendContent = friends
        ? `${renderMetricGrid(friends.metrics, { columns: 2 })}${friendLines.length > 0 ? `<div style="margin-top:12px;">${renderListLines(friendLines)}</div>` : ''}`
        : '<div style="font-size:13px; line-height:1.7; color:#7b8b9b;">当前未采集到好友详情。</div>';

    const subtitle = `
        <div>${escapeHtml(data.windowLabel || '统计区间未设置')}</div>
        ${sentAt ? `<div>发送时间：${escapeHtml(sentAt)}</div>` : ''}
    `;

    const bodyHtml = `
        <div style="padding:0 6px 10px 6px;">
            ${renderMetricGrid(rewardCards, { columns: 3 })}
        </div>
        <div style="padding:10px 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; background:#ffffff; border:1px solid #e7edf5; border-radius:22px;">
                <tr>
                    <td style="padding:20px 22px; background:#f8fbff; border-radius:22px 22px 0 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                            <tr>
                                <td style="vertical-align:top;">
                                    <div style="font-size:30px; line-height:1.2; font-weight:700; color:#17324d;">${escapeHtml(accountName)}</div>
                                    <div style="margin-top:10px;">${metaPills}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="padding:18px 22px 10px 22px;">
                        <div style="font-size:13px; line-height:1.6; color:#8a99ab;">本时段动作</div>
                        <div style="margin-top:6px; font-size:18px; line-height:1.7; font-weight:700; color:#1b3550;">${escapeHtml(data.operationSummary || '无明显动作')}</div>
                        ${renderInfoLine('统计区间', data.windowLabel || '--')}
                    </td>
                </tr>
                <tr>
                    <td style="padding:0 16px 16px 16px;">
                        ${renderMetricGrid(panelCards, { columns: 3 })}
                    </td>
                </tr>
            </table>
        </div>
        <div style="padding:10px 6px;">
            ${renderSectionCard('动作拆解', '更适合快速扫读的本时段行为统计', renderMetricGrid(buildOperationItems(diff.operations || {}), { columns: 3 }), '#35a36b')}
        </div>
        <div style="padding:10px 6px;">
            ${renderSectionCard('农场概况', '土地、生长阶段与待处理事项', farmContent, '#54b77f')}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
                <td width="50%" style="padding:10px 6px; vertical-align:top;">
                    ${renderSectionCard('背包概况', '库存体量与种类分布', bagContent, '#d58b34')}
                </td>
                <td width="50%" style="padding:10px 6px; vertical-align:top;">
                    ${renderSectionCard('好友概况', '可用好友与抽样展示', friendContent, '#4f77d9')}
                </td>
            </tr>
        </table>
        ${notes.length > 0 ? `<div style="padding:10px 6px;">${renderSectionCard('备注', '发送过程中附带的额外说明', renderListLines(notes), '#ea6f63')}</div>` : ''}
    `;

    return renderEmailShell({
        eyebrow: data.reportTitle || 'QQ Farm Bot',
        title: data.headline || '经营汇报',
        subtitle,
        bodyHtml,
        footerText: '此邮件由 QQ Farm Bot 自动发送，请勿直接回复。',
    });
}

function renderRestartReminderEmailHtml(data = {}) {
    const accountNames = Array.isArray(data.accountNames) ? data.accountNames.filter(Boolean) : [];
    const accountLines = accountNames.length > 0
        ? accountNames.map(name => `• ${name}`)
        : ['• 暂无账号信息'];

    const bodyHtml = `
        <div style="padding:0 6px 10px 6px;">
            ${renderSectionCard(
                '服务恢复通知',
                '服务器重启后的统一广播提醒',
                `${renderListLines([
                    `恢复时间：${data.restoredAt || '--'}`,
                    `关联账号：${data.accountLine || '--'}`,
                    '经营调度与推送链路已恢复，可继续观察后续经营汇报。',
                ])}
                <div style="margin-top:16px; padding:16px 18px; background:#f8fbff; border-radius:16px;">
                    ${renderListLines(accountLines)}
                </div>`,
                '#5a7cf0',
            )}
        </div>
    `;

    return renderEmailShell({
        eyebrow: data.reportTitle || 'QQ Farm Bot',
        title: '服务器重启提醒',
        subtitle: `<div>${escapeHtml(data.restoredAt || '')}</div>`,
        bodyHtml,
        footerText: '此邮件由 QQ Farm Bot 自动发送，请勿直接回复。',
    });
}

module.exports = {
    renderReportEmailHtml,
    renderRestartReminderEmailHtml,
};

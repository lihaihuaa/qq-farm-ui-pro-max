#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const startedAt = new Date()
const timestamp = formatTimestamp(startedAt)
const reportDir = path.join(ROOT, 'reports', `full-test-${timestamp}`)
const logsDir = path.join(reportDir, 'logs')

async function main() {
  await fs.mkdir(logsDir, { recursive: true })

  const coreTestFiles = await listTestFiles(path.join(ROOT, 'core', '__tests__'), '.test.js')
  const webTestFiles = await listTestFiles(path.join(ROOT, 'web', '__tests__'), '.test.mjs')

  console.log(`Discovered ${coreTestFiles.length} core test files and ${webTestFiles.length} web test files.`)

  const perFileResults = []

  for (let i = 0; i < coreTestFiles.length; i += 1) {
    const relativeFile = path.relative(ROOT, coreTestFiles[i])
    console.log(`[core ${i + 1}/${coreTestFiles.length}] ${relativeFile}`)
    const command = `node --test --test-reporter tap ${shellQuote(coreTestFiles[i])}`
    const run = await runShell(command, { cwd: ROOT, timeoutMs: 240_000 })
    const parsed = parseTapSummary(`${run.stdout}\n${run.stderr}`)
    const logPath = await writeLogFile('core', relativeFile, run)
    perFileResults.push({
      suite: 'core',
      file: relativeFile,
      command,
      cwd: ROOT,
      status: run.exitCode === 0 && !run.timedOut ? 'pass' : 'fail',
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      tests: parsed.tests,
      pass: parsed.pass,
      fail: parsed.fail,
      skipped: parsed.skipped,
      cancelled: parsed.cancelled,
      todo: parsed.todo,
      subtests: parsed.subtests,
      logPath,
    })
  }

  for (let i = 0; i < webTestFiles.length; i += 1) {
    const relativeFile = path.relative(ROOT, webTestFiles[i])
    const fileName = path.basename(webTestFiles[i])
    console.log(`[web-unit ${i + 1}/${webTestFiles.length}] ${relativeFile}`)
    const command = `node --test --experimental-strip-types --test-reporter tap ${shellQuote(path.join('__tests__', fileName))}`
    const run = await runShell(command, { cwd: path.join(ROOT, 'web'), timeoutMs: 240_000 })
    const parsed = parseTapSummary(`${run.stdout}\n${run.stderr}`)
    const logPath = await writeLogFile('web-unit', relativeFile, run)
    perFileResults.push({
      suite: 'web-unit',
      file: relativeFile,
      command,
      cwd: path.join(ROOT, 'web'),
      status: run.exitCode === 0 && !run.timedOut ? 'pass' : 'fail',
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      tests: parsed.tests,
      pass: parsed.pass,
      fail: parsed.fail,
      skipped: parsed.skipped,
      cancelled: parsed.cancelled,
      todo: parsed.todo,
      subtests: parsed.subtests,
      logPath,
    })
  }

  const integrationSuites = [
    {
      id: 'web-regression',
      name: 'Web Regression (Type Check + Runtime Build)',
      command: 'pnpm -C web run test:regression',
      cwd: ROOT,
      timeoutMs: 1_200_000,
    },
    {
      id: 'ui-assets',
      name: 'UI Assets Runtime Test',
      command: 'pnpm run test:ui-assets',
      cwd: ROOT,
      timeoutMs: 300_000,
    },
    {
      id: 'workspace-audit',
      name: 'Workspace Audit Script Tests',
      command: 'pnpm run test:workspace-audit-scripts',
      cwd: ROOT,
      timeoutMs: 300_000,
    },
    {
      id: 'ai-autostart',
      name: 'AI Auto-start Script Test',
      command: 'pnpm run test:ai',
      cwd: ROOT,
      timeoutMs: 300_000,
    },
  ]

  const commandResults = []
  for (const suite of integrationSuites) {
    console.log(`[command] ${suite.name}`)
    const run = await runShell(suite.command, { cwd: suite.cwd, timeoutMs: suite.timeoutMs })
    const parsed = parseTapSummary(`${run.stdout}\n${run.stderr}`)
    const logPath = await writeLogFile('command', suite.id, run)
    commandResults.push({
      ...suite,
      status: run.exitCode === 0 && !run.timedOut ? 'pass' : 'fail',
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      tests: parsed.tests,
      pass: parsed.pass,
      fail: parsed.fail,
      skipped: parsed.skipped,
      cancelled: parsed.cancelled,
      todo: parsed.todo,
      logPath,
    })
  }

  const allTestFiles = [...coreTestFiles, ...webTestFiles]
  const settingCoverage = await buildSettingCoverage(allTestFiles)
  const businessCoverage = buildBusinessCoverage(perFileResults)
  const summary = buildSummary(perFileResults, commandResults)

  const endedAt = new Date()
  const reportData = {
    generatedAt: endedAt.toISOString(),
    generatedAtLocal: endedAt.toLocaleString(),
    startedAt: startedAt.toISOString(),
    startedAtLocal: startedAt.toLocaleString(),
    root: ROOT,
    summary,
    perFileResults,
    commandResults,
    settingCoverage,
    businessCoverage,
  }

  const jsonPath = path.join(reportDir, 'report-data.json')
  await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2), 'utf8')

  const html = buildHtmlReport(reportData)
  const htmlPath = path.join(reportDir, 'report.html')
  await fs.writeFile(htmlPath, html, 'utf8')

  console.log(`HTML report: ${htmlPath}`)
  console.log(`JSON report: ${jsonPath}`)
}

function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

async function listTestFiles(dir, suffix) {
  const names = await fs.readdir(dir)
  return names
    .filter(name => name.endsWith(suffix))
    .sort((a, b) => a.localeCompare(b))
    .map(name => path.join(dir, name))
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function parseTapSummary(output) {
  const readNumber = (label) => {
    const match = output.match(new RegExp(`# ${label} (\\d+)`))
    return match ? Number.parseInt(match[1], 10) : 0
  }
  const tests = readNumber('tests')
  const pass = readNumber('pass')
  const fail = readNumber('fail')
  const skipped = readNumber('skipped')
  const cancelled = readNumber('cancelled')
  const todo = readNumber('todo')
  const subtests = []
  const matcher = /^(ok|not ok)\s+\d+\s+-\s+(.+)$/gm
  let match
  while ((match = matcher.exec(output)) !== null) {
    subtests.push({
      status: match[1] === 'ok' ? 'pass' : 'fail',
      name: match[2].trim(),
    })
  }
  return { tests, pass, fail, skipped, cancelled, todo, subtests }
}

function runShell(command, options = {}) {
  const cwd = options.cwd || ROOT
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 180_000
  const started = Date.now()
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn('zsh', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2_500).unref()
    }, timeoutMs)
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      resolve({
        command,
        cwd,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        signal: signal || null,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      })
    })
  })
}

async function writeLogFile(scope, name, run) {
  const safeName = String(name).replace(/[^a-zA-Z0-9._-]+/g, '_')
  const target = path.join(logsDir, `${scope}-${safeName}.log`)
  const content = [
    `command: ${run.command}`,
    `cwd: ${run.cwd}`,
    `exitCode: ${run.exitCode}`,
    `timedOut: ${run.timedOut}`,
    `durationMs: ${run.durationMs}`,
    '',
    '# stdout',
    run.stdout,
    '',
    '# stderr',
    run.stderr,
  ].join('\n')
  await fs.writeFile(target, content, 'utf8')
  return path.relative(ROOT, target)
}

async function buildSettingCoverage(testFiles) {
  const settingsPath = path.join(ROOT, 'web', 'src', 'views', 'Settings.vue')
  const storePath = path.join(ROOT, 'core', 'src', 'models', 'store.js')

  const [settingsText, storeText] = await Promise.all([
    fs.readFile(settingsPath, 'utf8'),
    fs.readFile(storePath, 'utf8'),
  ])

  const fieldLabels = parseLabelObject(settingsText, 'const fieldLabels', 'const diffFieldLabels')
  const diffFieldLabels = parseLabelObject(settingsText, 'const diffFieldLabels', 'function getDiffFieldLabel')
  const automationDefaults = parseAutomationDefaults(storeText)

  const testContentPairs = []
  for (const file of testFiles) {
    const content = await fs.readFile(file, 'utf8')
    testContentPairs.push({
      file: path.relative(ROOT, file),
      content,
    })
  }

  const rows = []
  const allKeys = [...new Set([...Object.keys(fieldLabels), ...Object.keys(diffFieldLabels)])]
  allKeys.sort((a, b) => a.localeCompare(b))

  for (const key of allKeys) {
    const label = diffFieldLabels[key] || fieldLabels[key] || key
    const tokenSet = new Set()
    tokenSet.add(key)
    if (key.startsWith('automation.'))
      tokenSet.add(key.slice('automation.'.length))
    if (!key.includes('.'))
      tokenSet.add(`automation.${key}`)
    const keyTail = key.split('.').pop()
    if (keyTail && keyTail.length >= 4)
      tokenSet.add(keyTail)

    const tokens = [...tokenSet].filter(Boolean)
    const matchedFiles = []
    for (const pair of testContentPairs) {
      if (matchesAnyToken(pair.content, tokens))
        matchedFiles.push(pair.file)
    }

    const automationKey = key.startsWith('automation.') ? key.slice('automation.'.length) : key
    const defaultValue = Object.prototype.hasOwnProperty.call(automationDefaults, automationKey)
      ? automationDefaults[automationKey]
      : ''

    rows.push({
      key,
      label,
      defaultValue,
      matchCount: matchedFiles.length,
      matchedFiles: matchedFiles.slice(0, 8),
      hasCoverage: matchedFiles.length > 0,
    })
  }

  const automationRows = rows
    .filter(row => Object.prototype.hasOwnProperty.call(automationDefaults, row.key) || row.key.startsWith('automation.'))
    .sort((a, b) => a.key.localeCompare(b.key))

  return {
    totalSettings: rows.length,
    coveredSettings: rows.filter(r => r.hasCoverage).length,
    uncoveredSettings: rows.filter(r => !r.hasCoverage).length,
    rows,
    automationRows,
  }
}

function parseLabelObject(source, startToken, endToken) {
  const start = source.indexOf(startToken)
  if (start < 0)
    return {}
  const end = source.indexOf(endToken, start + startToken.length)
  if (end < 0)
    return {}
  const segment = source.slice(start, end)
  const labels = {}
  const regex = /['"]?([A-Za-z0-9_.]+)['"]?\s*:\s*'([^']+)'/g
  let match
  while ((match = regex.exec(segment)) !== null) {
    labels[match[1]] = match[2]
  }
  return labels
}

function parseAutomationDefaults(storeText) {
  const match = storeText.match(/automation:\s*\{([\s\S]*?)\},\s*accountMode:/)
  if (!match)
    return {}
  const block = match[1]
  const values = {}
  const regex = /([A-Za-z0-9_]+)\s*:\s*(true|false|'[^']*'|"[^"]*"|\d+)/g
  let entry
  while ((entry = regex.exec(block)) !== null) {
    values[entry[1]] = entry[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}

function matchesAnyToken(content, tokens) {
  for (const token of tokens) {
    if (!token)
      continue
    if (token.includes('.')) {
      if (content.includes(token))
        return true
      continue
    }
    if (token.length < 4 && !token.includes('_'))
      continue
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`)
    if (pattern.test(content))
      return true
  }
  return false
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildBusinessCoverage(perFileResults) {
  const categories = [
    { name: '账号与权限管理', pattern: /(admin|auth|account|user-|visitor|operation-logs)/i },
    { name: '好友互动与偷菜策略', pattern: /(friend|steal|qq-friend|qrlogin)/i },
    { name: '农场种植与交易策略', pattern: /(farm|plant|mall|bag|task|reward|trade)/i },
    { name: '运行时与调度引擎', pattern: /(runtime|scheduler|worker|master|module|interval|network|socket)/i },
    { name: '系统更新与运行环境', pattern: /(system-update|workspace|web-dist|update-agent|database|mysql|redis|optional-db)/i },
    { name: '通知推送与报表', pattern: /(report|smtp|email|analytics|push|announcement)/i },
    { name: '前端设置与视图偏好', pattern: /(web\/__tests__|view-preference|accounts-view-preferences|trade-config)/i },
  ]

  const coverage = categories.map(cat => ({
    name: cat.name,
    totalFiles: 0,
    passedFiles: 0,
    failedFiles: 0,
    sampleFiles: [],
  }))

  for (const entry of perFileResults) {
    const target = coverage.find((item, idx) => categories[idx].pattern.test(entry.file)) || coverage[coverage.length - 1]
    target.totalFiles += 1
    if (entry.status === 'pass')
      target.passedFiles += 1
    else
      target.failedFiles += 1
    if (target.sampleFiles.length < 6)
      target.sampleFiles.push(entry.file)
  }

  return coverage
}

function buildSummary(perFileResults, commandResults) {
  const filePassCount = perFileResults.filter(r => r.status === 'pass').length
  const fileFailCount = perFileResults.length - filePassCount
  const totalTests = perFileResults.reduce((sum, item) => sum + (item.tests || 0), 0)
  const totalPass = perFileResults.reduce((sum, item) => sum + (item.pass || 0), 0)
  const totalFail = perFileResults.reduce((sum, item) => sum + (item.fail || 0), 0)
  const commandPassCount = commandResults.filter(r => r.status === 'pass').length
  const commandFailCount = commandResults.length - commandPassCount
  return {
    perFileTotal: perFileResults.length,
    perFilePassed: filePassCount,
    perFileFailed: fileFailCount,
    tests: totalTests,
    pass: totalPass,
    fail: totalFail,
    commandTotal: commandResults.length,
    commandPassed: commandPassCount,
    commandFailed: commandFailCount,
  }
}

function buildHtmlReport(data) {
  const failingFiles = data.perFileResults.filter(r => r.status !== 'pass')
  const failingCommands = data.commandResults.filter(r => r.status !== 'pass')
  const highRiskSettings = data.settingCoverage.rows.filter(r => !r.hasCoverage).slice(0, 30)
  const settingCoverageRate = data.settingCoverage.totalSettings > 0
    ? ((data.settingCoverage.coveredSettings / data.settingCoverage.totalSettings) * 100).toFixed(1)
    : '0.0'

  const fileRows = data.perFileResults
    .map(row => `<tr>
      <td>${escapeHtml(row.suite)}</td>
      <td>${escapeHtml(row.file)}</td>
      <td>${row.tests}</td>
      <td>${row.pass}</td>
      <td>${row.fail}</td>
      <td>${formatDuration(row.durationMs)}</td>
      <td class="${row.status === 'pass' ? 'ok' : 'fail'}">${escapeHtml(row.status.toUpperCase())}</td>
      <td>${escapeHtml(row.logPath)}</td>
    </tr>`)
    .join('\n')

  const commandRows = data.commandResults
    .map(row => `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td><code>${escapeHtml(row.command)}</code></td>
      <td>${formatDuration(row.durationMs)}</td>
      <td>${row.tests}</td>
      <td>${row.pass}</td>
      <td>${row.fail}</td>
      <td class="${row.status === 'pass' ? 'ok' : 'fail'}">${escapeHtml(row.status.toUpperCase())}</td>
      <td>${escapeHtml(row.logPath)}</td>
    </tr>`)
    .join('\n')

  const settingRows = data.settingCoverage.rows
    .map(row => `<tr>
      <td><code>${escapeHtml(row.key)}</code></td>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(String(row.defaultValue || ''))}</td>
      <td>${row.matchCount}</td>
      <td>${row.matchedFiles.map(item => `<code>${escapeHtml(item)}</code>`).join('<br>')}</td>
      <td class="${row.hasCoverage ? 'ok' : 'warn'}">${row.hasCoverage ? 'Covered' : 'No Direct Hit'}</td>
    </tr>`)
    .join('\n')

  const businessRows = data.businessCoverage
    .map(row => `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.totalFiles}</td>
      <td>${row.passedFiles}</td>
      <td>${row.failedFiles}</td>
      <td>${row.sampleFiles.map(file => `<code>${escapeHtml(file)}</code>`).join('<br>')}</td>
    </tr>`)
    .join('\n')

  const failingFileBlocks = failingFiles.length > 0
    ? failingFiles.map(item => `<details>
      <summary><strong>${escapeHtml(item.file)}</strong> (${escapeHtml(item.suite)})</summary>
      <p>Status: <span class="fail">${escapeHtml(item.status.toUpperCase())}</span>, ExitCode: ${item.exitCode}, Duration: ${formatDuration(item.durationMs)}</p>
      <p>Log file: <code>${escapeHtml(item.logPath)}</code></p>
    </details>`).join('\n')
    : '<p class="ok">No failed per-file tests.</p>'

  const failingCommandBlocks = failingCommands.length > 0
    ? failingCommands.map(item => `<details>
      <summary><strong>${escapeHtml(item.name)}</strong></summary>
      <p>Status: <span class="fail">${escapeHtml(item.status.toUpperCase())}</span>, ExitCode: ${item.exitCode}, Duration: ${formatDuration(item.durationMs)}</p>
      <p>Command: <code>${escapeHtml(item.command)}</code></p>
      <p>Log file: <code>${escapeHtml(item.logPath)}</code></p>
    </details>`).join('\n')
    : '<p class="ok">No failed integration commands.</p>'

  const highRiskList = highRiskSettings.length > 0
    ? `<ul>${highRiskSettings.map(item => `<li><code>${escapeHtml(item.key)}</code> - ${escapeHtml(item.label)}</li>`).join('')}</ul>`
    : '<p class="ok">All extracted settings had direct test hits.</p>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QQ Farm Bot Full Test Report</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --ok: #0f766e;
      --warn: #b45309;
      --fail: #b91c1c;
      --line: #cbd5e1;
      --accent: #0ea5e9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at top left, #e0f2fe 0%, var(--bg) 45%);
      color: var(--text);
    }
    .wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
    }
    h1, h2 { margin: 0 0 12px; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; border-left: 4px solid var(--accent); padding-left: 8px; }
    .meta { color: var(--muted); font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .kpi { background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
    .kpi strong { font-size: 22px; display: block; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; position: sticky; top: 0; z-index: 1; }
    .table-wrap { overflow: auto; max-height: 540px; border: 1px solid var(--line); border-radius: 10px; }
    .ok { color: var(--ok); font-weight: 600; }
    .warn { color: var(--warn); font-weight: 600; }
    .fail { color: var(--fail); font-weight: 700; }
    code { background: #e2e8f0; border-radius: 4px; padding: 1px 5px; }
    details { border: 1px dashed var(--line); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    summary { cursor: pointer; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>QQ Farm Bot 全量测试报告</h1>
      <p class="meta">生成时间: ${escapeHtml(data.generatedAtLocal)} | 开始时间: ${escapeHtml(data.startedAtLocal)} | 工作目录: <code>${escapeHtml(data.root)}</code></p>
      <p class="meta">本报告覆盖: 后端核心测试、前端单测、回归构建测试、脚本级测试，并补充设置/开关与业务逻辑覆盖矩阵。</p>
    </div>

    <div class="card">
      <h2>执行总览</h2>
      <div class="grid">
        <div class="kpi">测试文件总数<strong>${data.summary.perFileTotal}</strong></div>
        <div class="kpi">文件通过<strong class="ok">${data.summary.perFilePassed}</strong></div>
        <div class="kpi">文件失败<strong class="${data.summary.perFileFailed > 0 ? 'fail' : 'ok'}">${data.summary.perFileFailed}</strong></div>
        <div class="kpi">累计测试点<strong>${data.summary.tests}</strong></div>
        <div class="kpi">通过测试点<strong class="ok">${data.summary.pass}</strong></div>
        <div class="kpi">失败测试点<strong class="${data.summary.fail > 0 ? 'fail' : 'ok'}">${data.summary.fail}</strong></div>
        <div class="kpi">命令级测试<strong>${data.summary.commandTotal}</strong></div>
        <div class="kpi">命令级失败<strong class="${data.summary.commandFailed > 0 ? 'fail' : 'ok'}">${data.summary.commandFailed}</strong></div>
        <div class="kpi">设置项覆盖率<strong>${settingCoverageRate}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h2>命令级测试结果</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>测试阶段</th>
              <th>命令</th>
              <th>耗时</th>
              <th>tests</th>
              <th>pass</th>
              <th>fail</th>
              <th>状态</th>
              <th>日志</th>
            </tr>
          </thead>
          <tbody>${commandRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>按测试文件明细</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Suite</th>
              <th>文件</th>
              <th>tests</th>
              <th>pass</th>
              <th>fail</th>
              <th>耗时</th>
              <th>状态</th>
              <th>日志</th>
            </tr>
          </thead>
          <tbody>${fileRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>业务逻辑覆盖分组</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分组</th>
              <th>文件数</th>
              <th>通过</th>
              <th>失败</th>
              <th>样例文件</th>
            </tr>
          </thead>
          <tbody>${businessRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>设置/开关覆盖矩阵</h2>
      <p class="meta">来源: <code>web/src/views/Settings.vue</code> 的 fieldLabels + diffFieldLabels，结合测试源码关键词命中统计。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>设置键</th>
              <th>显示名称</th>
              <th>默认值(若可解析)</th>
              <th>命中测试数</th>
              <th>命中样例</th>
              <th>覆盖状态</th>
            </tr>
          </thead>
          <tbody>${settingRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>失败项与风险项</h2>
      <h3>失败测试文件</h3>
      ${failingFileBlocks}
      <h3>失败命令阶段</h3>
      ${failingCommandBlocks}
      <h3>未直接命中的设置项（前 30）</h3>
      ${highRiskList}
    </div>
  </div>
</body>
</html>`
}

function formatDuration(ms) {
  const value = Number(ms) || 0
  if (value < 1_000)
    return `${value} ms`
  return `${(value / 1_000).toFixed(2)} s`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

main().catch(async (error) => {
  const message = error && error.stack ? error.stack : String(error)
  console.error(message)
  try {
    await fs.mkdir(reportDir, { recursive: true })
    await fs.writeFile(path.join(reportDir, 'fatal-error.log'), `${message}\n`, 'utf8')
  }
  catch {}
  process.exitCode = 1
})

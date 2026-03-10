import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick, reactive } from 'vue'

const { useViewPreferenceSync } = await import('../src/composables/use-view-preference-sync.ts')

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createAnalyticsSyncHarness(overrides = {}) {
  const state = reactive({
    sortKey: 'exp',
    strategyPanelCollapsed: false,
  })

  const calls = {
    fetchCount: 0,
    saves: [],
  }

  const scope = effectScope()
  const sync = scope.run(() => useViewPreferenceSync({
    key: 'analyticsViewState',
    label: '图鉴页视图偏好',
    buildState: () => ({
      sortKey: state.sortKey,
      strategyPanelCollapsed: state.strategyPanelCollapsed,
    }),
    applyState: (value) => {
      const next = value && typeof value === 'object' ? value : {}
      state.sortKey = typeof next.sortKey === 'string' ? next.sortKey : 'exp'
      state.strategyPanelCollapsed = typeof next.strategyPanelCollapsed === 'boolean'
        ? next.strategyPanelCollapsed
        : false
    },
    defaultState: {
      sortKey: 'exp',
      strategyPanelCollapsed: false,
    },
    readLocalFallback: () => ({
      sortKey: 'profit',
      strategyPanelCollapsed: true,
    }),
    shouldSyncFallback: next => next.sortKey !== 'exp' || next.strategyPanelCollapsed !== false,
    debounceMs: 5,
    fetchPreferences: async () => {
      calls.fetchCount += 1
      return null
    },
    savePreferences: async (payload) => {
      calls.saves.push(payload)
      return payload
    },
    ...overrides,
  }))

  assert.ok(sync, 'expected effect scope to return sync controller')

  return {
    state,
    calls,
    sync,
    dispose() {
      scope.stop()
    },
  }
}

test('useViewPreferenceSync hydrates local fallback and persists it when remote state is missing', async () => {
  const harness = createAnalyticsSyncHarness()

  await harness.sync.hydrate()

  assert.equal(harness.calls.fetchCount, 1)
  assert.deepEqual({
    sortKey: harness.state.sortKey,
    strategyPanelCollapsed: harness.state.strategyPanelCollapsed,
  }, {
    sortKey: 'profit',
    strategyPanelCollapsed: true,
  })
  assert.deepEqual(harness.calls.saves, [{
    analyticsViewState: {
      sortKey: 'profit',
      strategyPanelCollapsed: true,
    },
  }])

  harness.sync.enableSync()
  harness.state.sortKey = 'level'
  await nextTick()
  await delay(25)

  assert.deepEqual(harness.calls.saves.at(-1), {
    analyticsViewState: {
      sortKey: 'level',
      strategyPanelCollapsed: true,
    },
  })

  harness.dispose()
})

test('useViewPreferenceSync prefers preloaded remote payload and skips fallback backfill', async () => {
  const harness = createAnalyticsSyncHarness({
    fetchPreferences: async () => {
      throw new Error('hydrate should not fetch when preloaded payload exists')
    },
  })

  await harness.sync.hydrate({
    analyticsViewState: {
      sortKey: 'fert',
      strategyPanelCollapsed: true,
    },
  })

  assert.equal(harness.calls.fetchCount, 0)
  assert.deepEqual(harness.calls.saves, [])
  assert.deepEqual({
    sortKey: harness.state.sortKey,
    strategyPanelCollapsed: harness.state.strategyPanelCollapsed,
  }, {
    sortKey: 'fert',
    strategyPanelCollapsed: true,
  })

  harness.dispose()
})

test('useViewPreferenceSync prefers fetched remote payload and does not backfill local fallback', async () => {
  const harness = createAnalyticsSyncHarness({
    fetchPreferences: async () => {
      harness.calls.fetchCount += 1
      return {
        analyticsViewState: {
          sortKey: 'coins',
          strategyPanelCollapsed: true,
        },
      }
    },
  })

  await harness.sync.hydrate()

  assert.equal(harness.calls.fetchCount, 1)
  assert.deepEqual(harness.calls.saves, [])
  assert.deepEqual({
    sortKey: harness.state.sortKey,
    strategyPanelCollapsed: harness.state.strategyPanelCollapsed,
  }, {
    sortKey: 'coins',
    strategyPanelCollapsed: true,
  })

  harness.dispose()
})

test('useViewPreferenceSync debounces rapid changes and cancels pending sync on dispose', async () => {
  const harness = createAnalyticsSyncHarness({
    fetchPreferences: async () => {
      harness.calls.fetchCount += 1
      return {
        analyticsViewState: {
          sortKey: 'exp',
          strategyPanelCollapsed: false,
        },
      }
    },
  })

  await harness.sync.hydrate()
  harness.sync.enableSync()

  harness.state.sortKey = 'level'
  await nextTick()
  harness.state.strategyPanelCollapsed = true
  await nextTick()
  harness.state.sortKey = 'coins'
  await nextTick()
  await delay(25)

  assert.equal(harness.calls.saves.length, 1)
  assert.deepEqual(harness.calls.saves[0], {
    analyticsViewState: {
      sortKey: 'coins',
      strategyPanelCollapsed: true,
    },
  })

  harness.state.sortKey = 'fert'
  await nextTick()
  harness.dispose()
  await delay(25)

  assert.equal(harness.calls.saves.length, 1)
})

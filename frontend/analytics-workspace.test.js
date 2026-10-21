import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('All workspace surfaces share dark tokens while the Twin canvas remains light', () => {
  const root = css.slice(0, css.indexOf('\n}'));
  for (const [token, value] of Object.entries({
    '--dt-panel-light': '#292c2c',
    '--dt-surface': '#333737',
    '--dt-text': '#e5e7e5',
    '--dt-viewport': '#d9e0e2',
  }))
    assert.ok(root.includes(`${token}: ${value};`));
  assert.equal(css.match(/--dt-text:/g).length, 1);
  assert.equal(css.match(/--dt-border-light:/g).length, 1);
  assert.ok(!css.includes('#edf5f9'));
  assert.ok(!css.includes('#52c5ce'));
  assert.match(
    css,
    /\.workspace-main\[data-workspace='systems'\] \{\s*--dt-viewport: var\(--dt-panel-light\);/
  );
  assert.ok(
    main.includes(
      'viewer?.scene.background.set(window.getComputedStyle(viewerPanel).backgroundColor)'
    )
  );
});

test('Analytics controls belong to the sidebar and dashboard owns the analysis surface', () => {
  const sidebar = html.slice(
    html.indexOf('id="analytics-workspace"'),
    html.indexOf('id="event-browser"')
  );
  for (const id of [
    'history-query',
    'history-category',
    'history-asset',
    'history-source',
    'history-aggregation',
    'history-live',
  ]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1);
    assert.ok(sidebar.includes(`id="${id}"`));
  }
  assert.ok(html.includes('id="analytics-dashboard"'));
  assert.ok(html.includes('id="analytics-statistics-body"'));
});

test('Analytics reuses the live owner and disposes owned charts, requests and timer', () => {
  assert.equal(main.split('new LiveCurrentState(').length - 1, 1);
  assert.equal(main.split('new RackViewer(').length - 1, 1);
  assert.ok(main.includes('analytics: true'));
  assert.ok(main.includes('disposeHistoryChart(item.chart)'));
  assert.ok(main.includes('window.clearTimeout(analyticsRefreshTimer)'));
  assert.ok(main.includes('historyAbort?.abort()'));
  assert.ok(main.includes('...analyticsSources'));
});

test('Direct Analytics navigation loads history once identities are ready and discards mismatched queries', () => {
  assert.match(
    main,
    /synchronizeNavigation\(\);\s*renderMeasurements\([^;]+;\s*refreshHistory\(\);/
  );
  assert.ok(main.includes('(changed || !analyticsFetchedAt)'));
  assert.ok(main.includes('!analyticsLoading'));
  assert.match(main, /if \(!metrics\.length\) \{[\s\S]*?'Waiting for sources';\s*return;/);
  assert.match(
    main,
    /if \(query !== analyticsLoadedQuery\) \{\s*analyticsPayloads = \[\];\s*renderAnalyticsDashboard\(\);/
  );
  assert.ok(main.includes('if (historyAbort?.signal === signal) analyticsLoading = false'));
});

test('Shared Assets history expands the actual chart container instead of the retired trace height', () => {
  assert.match(css, /\.hardware-scope-traces:has\(\.analysis-chart\) \{\s*height: auto;/);
  assert.match(
    css,
    /\.hardware-scope-signal \.history-chart\.analysis-chart \{\s*position: relative;\s*inset: auto;\s*height: 300px;/
  );
  assert.ok(!css.includes('.history-chart:has(.analysis-chart)'));
});

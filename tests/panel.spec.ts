import { test, expect } from '@grafana/plugin-e2e';

test('draws a map canvas', async ({ gotoPanelEditPage, readProvisionedDashboard }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'maplibre-4326.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(panelEditPage.panel.locator.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(panelEditPage.panel.locator).toContainText('EPSG:4326');
});

test('lists the source and data layer editors', async ({ gotoPanelEditPage, readProvisionedDashboard, page }) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'maplibre-4326.json' });
  await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(page.getByText('NASA GIBS Blue Marble').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add data layer' })).toBeVisible();
});

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

test('opens the panel editor from the dashboard without errors', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'maplibre-4326.json' });
  await gotoDashboardPage(dashboard);
  await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible();
  // Leaving the dashboard unmounts the maps, which used to throw while removing their controls.
  await page.getByText('GIBS WMTS (plate carrée regrid) + markers').hover();
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/editPanel=1/);
  await expect(page.getByText('An unexpected error happened')).toHaveCount(0);
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
});

const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.setContent(`
    <label><input type="checkbox">Review</label>
    <button id="filter">Pending only</button><button id="reset">Reset</button>
    <script>
      const item = document.querySelector('input');
      document.querySelector('#filter').onclick = () => item.parentElement.hidden = item.checked;
      document.querySelector('#reset').onclick = () => {
        item.checked = false;
        item.parentElement.hidden = false;
      };
    </script>
  `);
});
test('[delivery:checklist] check', async ({ page }) => {
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('checkbox')).toBeChecked();
});
test('[delivery:checklist] filter', async ({ page }) => {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Pending only' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
test('[delivery:checklist] reset', async ({ page }) => {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

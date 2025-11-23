import { expect, test, type Locator } from "@playwright/test";

const numericPrice = async (locator: Locator) => {
  const raw = await locator.textContent();
  const digits = (raw || "").replace(/[^\d]/g, "");
  return Number.parseInt(digits, 10) || 0;
};

test("loads presets and recalculates price when modules change", async ({ page }) => {
  await page.goto("/");

  const price = page.locator(".price-box-main strong");
  await expect(price).toHaveText(/\d/);

  const initialPrice = await numericPrice(price);

  await page.getByRole("button", { name: /24 m2/i }).click();
  await expect.poll(() => numericPrice(price)).not.toBe(initialPrice);
  const afterPreset = await numericPrice(price);

  const counterInput = page.getByLabel(/Counters\s*\/\s*Theken/i);
  const currentCounters = Number.parseInt(await counterInput.inputValue(), 10) || 0;
  await counterInput.fill(String(currentCounters + 1));
  await expect.poll(() => numericPrice(price)).not.toBe(afterPreset);
  const afterCounters = await numericPrice(price);

  const powerCheckbox = page.getByLabel(/Tresen mit Strompaket/i);
  if (await powerCheckbox.isVisible()) {
    await powerCheckbox.check();
    await expect.poll(() => numericPrice(price)).not.toBe(afterCounters);
  }
});

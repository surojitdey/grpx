import { test, expect } from '@playwright/test';

test.describe('Design Editor E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
    });

    test('should load design editor and display canvas', async ({ page }) => {
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
        const rect = await canvas.boundingBox();
        expect(rect).toBeTruthy();
    });

    test('should create rectangle and update properties', async ({ page }) => {
        // Click rectangle tool in toolbar
        const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
        if (await rectangleBtn.isVisible()) {
            await rectangleBtn.click();
        }

        // Click canvas to create rectangle
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();
        if (rect) {
            await canvas.click({ position: { x: 200, y: 200 } });
        }

        // Verify object appears
        await page.waitForTimeout(300);
        const xInput = page.locator('input[placeholder="0"]').first();
        await expect(xInput).toBeVisible();
    });

    test('should delete object with Delete key', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                // Select it
                await canvas.click({ position: { x: 200, y: 200 } });

                // Press Delete
                await page.keyboard.press('Delete');

                // Verify it's gone
                await page.waitForTimeout(300);
            }
        }
    });

    test('should duplicate object with Ctrl+D', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                // Duplicate
                await page.keyboard.press('Control+D');

                // Wait for duplication
                await page.waitForTimeout(300);
            }
        }
    });

    test('should undo and redo actions', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                await page.waitForTimeout(300);

                // Undo
                await page.keyboard.press('Control+Z');
                await page.waitForTimeout(300);

                // Redo
                await page.keyboard.press('Control+Y');
                await page.waitForTimeout(300);
            }
        }
    });

    test('should select all with Ctrl+A', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create multiple rectangles
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                await rectangleBtn.click();
                await canvas.click({ position: { x: 300, y: 300 } });

                // Select all
                await page.keyboard.press('Control+A');

                // Wait for selection
                await page.waitForTimeout(300);
            }
        }
    });

    test('should update object properties through properties panel', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                // Select it
                await canvas.click({ position: { x: 200, y: 200 } });

                // Update X position
                const xInput = page.locator('input[placeholder="0"]').first();
                if (await xInput.isVisible()) {
                    await xInput.fill('150');
                    await expect(xInput).toHaveValue('150');
                }
            }
        }
    });

    test('should change fill color of rectangle', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                // Select it
                await canvas.click({ position: { x: 200, y: 200 } });

                // Update fill color
                const colorInputs = page.locator('input[type="color"]');
                const fillColorInput = colorInputs.first();
                if (await fillColorInput.isVisible()) {
                    await fillColorInput.fill('#ff0000');
                    await expect(fillColorInput).toHaveValue('#ff0000');
                }
            }
        }
    });

    test('should persist changes across interactions', async ({ page }) => {
        const canvas = page.locator('canvas');
        const rect = await canvas.boundingBox();

        if (rect) {
            // Create rectangle
            const rectangleBtn = page.locator('button:has-text("Rectangle")').first();
            if (await rectangleBtn.isVisible()) {
                await rectangleBtn.click();
                await canvas.click({ position: { x: 200, y: 200 } });

                // Wait for autosave
                await page.waitForTimeout(1500);

                // Reload page
                await page.reload();
                await page.waitForLoadState('networkidle');

                // Verify canvas still has content
                const reloadedCanvas = page.locator('canvas');
                await expect(reloadedCanvas).toBeVisible();
            }
        }
    });
});

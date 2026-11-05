  report.checks.professionalHeaderNavigation = await page.locator(".app-header .main-nav .nav-item.active").count() === 1;
  assert.equal(report.checks.professionalHeaderNavigation, true, "Compact studio header navigation did not render.");
  report.checks.legacySidebarRemoved =
    await page.locator(".sidebar, .nav-item-muted, .nav-soon, .sidebar-footer").count() === 0;
  assert.equal(report.checks.legacySidebarRemoved, true, "Legacy sidebar and placeholder navigation should be removed.");
  const desktopLayout = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const editor = document.querySelector(".editor-column").getBoundingClientRect();
    const settings = document.querySelector(".settings-column").getBoundingClientRect();
    return {
      viewport,
      editorWidth: Math.round(editor.width),
      settingsWidth: Math.round(settings.width),
      horizontalOverflow: document.documentElement.scrollWidth > viewport.width,
      sideBySide: settings.left > editor.left && settings.left >= editor.right - 2
    };
  });
  report.desktopLayout1366x768 = desktopLayout;
  assert.equal(desktopLayout.viewport.width, 1366, "Desktop check should run at 1366px width.");
  assert.equal(desktopLayout.viewport.height, 768, "Desktop check should run at 768px height.");
  assert.equal(desktopLayout.horizontalOverflow, false, "Studio should not overflow horizontally at a Windows desktop size.");
  assert.equal(desktopLayout.sideBySide, true, "Editor and settings should fit side by side on a desktop.");
  assert.ok(desktopLayout.editorWidth >= 650, "The script editor should have adequate desktop width.");
  report.checks.windowsDesktopLayoutFits = true;
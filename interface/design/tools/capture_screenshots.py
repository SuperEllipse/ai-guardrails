"""Capture the wireframe screenshots in interface/design/screenshots/ at 1280 px.

Setup on this CDSW image (no root, so Chromium's missing libraries live in ~/.cache/chrome-libs):
    pip install --user playwright
    PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright python3 -m playwright install chromium-headless-shell

Run:
    PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright \
    LD_LIBRARY_PATH=~/.cache/chrome-libs/usr/lib/x86_64-linux-gnu \
    python3 interface/design/tools/capture_screenshots.py

To capture the real app instead, change URL and the selectors to match the built UI.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path("/home/cdsw/interface/design")
OUT = ROOT / "screenshots"
URL = (ROOT / "wireframe.html").as_uri()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 860}, device_scale_factor=1.5, reduced_motion="reduce")
        page = ctx.new_page()
        page.goto(URL)

        def shot(name: str, full: bool = True) -> None:
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUT / name), full_page=full)
            print("saved", name)

        def tab(name: str) -> None:
            page.click(f'#gr nav [data-tab="{name}"]')

        def test(title: str) -> None:
            page.locator("#gr .test", has_text=title).first.click()
            page.wait_for_timeout(300)

        tab("guide")
        shot("01-start-here.png")

        tab("live")
        shot("02-live-risk-test-idle.png", full=False)
        test("Fund pick in answer")
        shot("03-live-blocked-at-output.png")
        test("Mutual fund")
        shot("04-live-blocked-at-input.png")
        test("New account transfer")
        shot("05-live-payment-blocked.png")
        test("Refund promise")
        shot("06-live-gap-found.png")

        page.click("#gr-close")
        shot("07-custom-policy-studio.png")
        page.click("#gr-test")
        page.wait_for_timeout(300)
        page.click("#gr-deploy")
        page.wait_for_timeout(300)
        shot("08-custom-policy-tested-and-deployed.png")
        page.evaluate("const s=document.getElementById('gr-region'); s.value='SG'; s.dispatchEvent(new Event('change'))")
        page.click("#gr-verify")
        page.wait_for_timeout(300)
        shot("09-live-gap-closed.png")

        page.click("#gr-all")
        page.wait_for_timeout(2500)
        shot("10-live-run-all-tests.png")

        page.click("#gr-open")
        shot("11-audit-trail.png")

        tab("stress")
        shot("12-stress-test.png")

        tab("setup")
        shot("13-setup-connections.png")
        page.click('label.jopt:has(input[value="nim"])')
        page.click('[data-test="judge"]')
        page.wait_for_timeout(300)
        shot("14-setup-judge-test-failed.png")
        page.fill("#gr-jtok", "nvapi-demo-token")
        page.click('[data-test="judge"]')
        page.wait_for_timeout(300)
        page.click("#gr-save")
        page.wait_for_timeout(300)
        shot("15-setup-saved-and-ready.png")

        page.click('[data-sub="prof"]')
        page.click('label.jopt:has(input[value="v3"])')
        shot("16-setup-regional-id-profiles.png")
        page.click('[data-sub="scripts"]')
        shot("17-setup-policy-scripts.png")

        errors = page.evaluate("window.__errors || []")
        if errors:
            print("page errors:", errors, file=sys.stderr)
        browser.close()


if __name__ == "__main__":
    main()

// Per CB-1.6 AC 2 + AC 7. Unit tests for deriveDeviceLabel.

import { describe, expect, it } from "vitest";
import { deriveDeviceLabel } from "@/app/setup/lib/device-label";

describe("deriveDeviceLabel", () => {
  describe("known browser + OS combinations", () => {
    it.each<[string, string]>([
      // Safari on macOS — modern Sonoma
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
        "Safari on macOS",
      ],
      // Safari on iOS
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
        "Safari on iOS",
      ],
      // Chrome on macOS
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Chrome on macOS",
      ],
      // Chrome on Windows
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Chrome on Windows",
      ],
      // Chrome on Linux
      [
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Chrome on Linux",
      ],
      // Chrome on Android
      [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Chrome on Android",
      ],
      // Firefox on macOS
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Firefox on macOS",
      ],
      // Firefox on Windows
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Firefox on Windows",
      ],
      // Edge on Windows (Chromium-based; must beat Chrome match)
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Edge on Windows",
      ],
      // Opera on macOS (Chromium-based with OPR/ tag)
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0",
        "Opera on macOS",
      ],
    ])("derives label %j from UA → %s", (ua, expected) => {
      expect(deriveDeviceLabel(ua)).toBe(expected);
    });
  });

  describe("OS-only matches when browser is unknown", () => {
    it("returns just the OS for a UA with recognizable OS but no browser pattern", () => {
      expect(deriveDeviceLabel("custom-agent (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macOS");
    });
  });

  describe("browser-only matches when OS is unknown", () => {
    it("returns just the browser for a UA with recognizable browser but no OS", () => {
      expect(deriveDeviceLabel("Mozilla/5.0 (UnknownOS) Chrome/120.0.0.0")).toBe("Chrome");
    });
  });

  describe("fallback to 'this device'", () => {
    it.each([
      [""],
      ["random nonsense"],
      ["curl/8.0.0"],
      ["Mozilla/5.0"],
    ])("returns 'this device' for %j", (ua) => {
      expect(deriveDeviceLabel(ua)).toBe("this device");
    });

    it.each([
      [undefined],
      [null],
      [42],
      [{}],
    ])("returns 'this device' for non-string %j", (ua) => {
      expect(deriveDeviceLabel(ua)).toBe("this device");
    });
  });

  describe("never returns empty", () => {
    it.each<[string]>([
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"],
      ["Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"],
      ["totally unknown UA"],
      [""],
    ])("derives non-empty label from %j", (ua) => {
      const label = deriveDeviceLabel(ua);
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

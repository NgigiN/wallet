import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallHint } from "../src/components/InstallHint";
describe("InstallHint", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows the iOS Share hint in Safari on iPhone when not installed", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", standalone: false });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    render(<InstallHint />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });
  it("renders nothing when already standalone", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });
});

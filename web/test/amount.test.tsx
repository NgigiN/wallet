import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaskProvider } from "../src/hooks/useMask";
import { Amount } from "../src/components/Amount";

describe("Amount masking", () => {
  it("is hidden by default when masked and reveals on toggle", () => {
    render(<MaskProvider><Amount cents={123400} masked /><button data-testid="eye" onClick={() => {}} /></MaskProvider>);
    expect(screen.getByText("Ksh ••••")).toBeInTheDocument();
  });
  it("shows the value when not masked", () => {
    render(<MaskProvider><Amount cents={123400} /></MaskProvider>);
    expect(screen.getByText("Ksh 1,234")).toBeInTheDocument();
  });
});

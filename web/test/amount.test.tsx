import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaskProvider, useMask } from "../src/hooks/useMask";
import { Amount } from "../src/components/Amount";

function Eye() {
  const { toggle } = useMask();
  return <button data-testid="eye" onClick={toggle} />;
}

describe("Amount masking", () => {
  it("is hidden by default when masked and reveals on toggle", () => {
    render(<MaskProvider><Amount cents={123400} masked /><Eye /></MaskProvider>);
    expect(screen.getByText("Ksh ••••")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("eye"));
    expect(screen.getByText("Ksh 1,234")).toBeInTheDocument();
    expect(screen.queryByText("Ksh ••••")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("eye"));
    expect(screen.getByText("Ksh ••••")).toBeInTheDocument();
  });
  it("shows the value when not masked", () => {
    render(<MaskProvider><Amount cents={123400} /></MaskProvider>);
    expect(screen.getByText("Ksh 1,234")).toBeInTheDocument();
  });
});

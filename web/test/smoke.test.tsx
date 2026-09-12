import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";

describe("App", () => {
  it("renders the shell title", () => {
    render(<App />);
    expect(screen.getByText("Wallet")).toBeInTheDocument();
  });
});

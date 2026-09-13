import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";

describe("App", () => {
  it("renders the session gate before routing", () => {
    render(<App />);
    expect(screen.getByText(/Loading|Sign in|Wallet/)).toBeInTheDocument();
  });
});

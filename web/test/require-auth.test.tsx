import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "../src/app/RequireAuth";
import { useSession } from "../src/api/auth";

vi.mock("../src/api/auth", () => ({ useSession: vi.fn() }));

const session = vi.mocked(useSession);
const renderGate = () => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route element={<RequireAuth />}><Route index element={<div>INSIDE</div>} /></Route>
      <Route path="/sign-in" element={<div>SIGN IN</div>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => session.mockReset());

describe("RequireAuth", () => {
  it("offers a retry instead of signing the user out when the session check fails", () => {
    const refetch = vi.fn();
    session.mockReturnValue({ data: null, isPending: false, isRefetching: false, error: { status: 429, statusText: "Too Many Requests" } as any, refetch });
    renderGate();
    expect(screen.getByText("Couldn't check your session.")).toBeInTheDocument();
    expect(screen.queryByText("SIGN IN")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("redirects to sign-in only when the check succeeded and there is no session", () => {
    session.mockReturnValue({ data: null, isPending: false, isRefetching: false, error: null, refetch: vi.fn() });
    renderGate();
    expect(screen.getByText("SIGN IN")).toBeInTheDocument();
  });

  it("renders the app for a live session", () => {
    session.mockReturnValue({ data: { user: { id: "u1" } } as any, isPending: false, isRefetching: false, error: null, refetch: vi.fn() });
    renderGate();
    expect(screen.getByText("INSIDE")).toBeInTheDocument();
  });
});

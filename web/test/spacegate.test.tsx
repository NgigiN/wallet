import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/schema";
import { setCachedSpaces, setCurrentSpaceId } from "../src/db/meta";
import { SpaceGate } from "../src/app/SpaceGate";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });
afterEach(() => vi.unstubAllGlobals());

describe("SpaceGate", () => {
  it("opens from the cached space list when the network is unreachable", async () => {
    await setCurrentSpaceId("s1");
    await setCachedSpaces([{ id: "s1", name: "Personal", kind: "personal", role: "owner" }]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<SpaceGate />}>
            <Route index element={<div>CHILD</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("CHILD")).toBeInTheDocument();
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });
});

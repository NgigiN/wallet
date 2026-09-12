import { Route, Routes } from "react-router";
import { Shell } from "./Shell";
import { RequireAuth } from "./RequireAuth";
import { SpaceGate } from "./SpaceGate";
import { SignIn } from "../screens/SignIn";
import { SignUp } from "../screens/SignUp";
import { Inbox } from "../screens/Inbox";
import { AddTransaction } from "../screens/AddTransaction";
import { TransactionDetail } from "../screens/TransactionDetail";

const Todo = ({ name }: { name: string }) => <div className="empty">{name}</div>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route element={<RequireAuth />}>
        <Route element={<SpaceGate />}>
          <Route element={<Shell />}>
            <Route index element={<Inbox />} />
            <Route path="add" element={<AddTransaction />} />
            <Route path="stats" element={<Todo name="Stats" />} />
            <Route path="settings" element={<Todo name="Settings" />} />
          </Route>
          <Route path="tx/:id" element={<TransactionDetail />} />
        </Route>
      </Route>
    </Routes>
  );
}

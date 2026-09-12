import { Route, Routes } from "react-router";
import { Shell } from "./Shell";
import { RequireAuth } from "./RequireAuth";
import { SignIn } from "../screens/SignIn";
import { SignUp } from "../screens/SignUp";

const Todo = ({ name }: { name: string }) => <div className="empty">{name}</div>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Todo name="Inbox" />} />
          <Route path="add" element={<Todo name="Add" />} />
          <Route path="stats" element={<Todo name="Stats" />} />
          <Route path="settings" element={<Todo name="Settings" />} />
        </Route>
      </Route>
    </Routes>
  );
}

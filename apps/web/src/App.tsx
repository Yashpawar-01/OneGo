import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import { Conversations } from "./pages/Conversations.js";
import { ModelRouter } from "./pages/ModelRouter.js";
import { NotFound } from "./pages/NotFound.js";
import { Overview } from "./pages/Overview.js";
import { Projects } from "./pages/Projects.js";
import { Providers } from "./pages/Providers.js";
import { Settings } from "./pages/Settings.js";
import { UsageAnalytics } from "./pages/UsageAnalytics.js";
import { Workspace } from "./pages/Workspace.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="providers" element={<Providers />} />
          <Route path="router" element={<ModelRouter />} />
          <Route path="usage" element={<UsageAnalytics />} />
          <Route path="projects" element={<Projects />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/base.css";

// App.tsx is built by the app-shell agent (build-plan slice later). Until then
// this import is the only outstanding typecheck error and that is expected.
const container = document.getElementById("root");
if (!container) throw new Error("root element not found");
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

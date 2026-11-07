import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/lilita-one/latin-400.css";
import "@fontsource-variable/baloo-2";
import "./hud/hud.css";
import "./hud/welcome.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

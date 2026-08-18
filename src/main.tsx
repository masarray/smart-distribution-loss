import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AboutDialog } from "@/components/sdl/AboutDialog";
import { FieldOperationalCockpitP5 } from "@/components/sdl/FieldOperationalCockpitP5";
import "./styles.css";
import "./progress-motion.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <FieldOperationalCockpitP5 />
    <AboutDialog />
  </React.StrictMode>,
);

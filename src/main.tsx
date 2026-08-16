import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FieldOperationalCockpitP5 } from "@/components/sdl/FieldOperationalCockpitP5";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <FieldOperationalCockpitP5 />
  </React.StrictMode>,
);

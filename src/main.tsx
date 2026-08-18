import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AboutSheet } from "@/components/sdl/AboutSheet";
import { FieldOperationalCockpitP5 } from "@/components/sdl/FieldOperationalCockpitP5";
import { LanguageControl } from "@/components/sdl/LanguageControl";
import { LanguageProvider } from "@/lib/sdl/i18n";
import "./styles.css";
import "./progress-motion.css";

function seedLocalEngineeringLanguage() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return;
  if (new URLSearchParams(window.location.search).has("lang")) return;
  if (window.localStorage.getItem("sdl-language")) return;
  window.localStorage.setItem("sdl-language", "id");
}

seedLocalEngineeringLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
      <FieldOperationalCockpitP5 />
      <AboutSheet />
      <LanguageControl />
    </LanguageProvider>
  </React.StrictMode>,
);

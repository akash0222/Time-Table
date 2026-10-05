import React from "react";
import { createRoot } from "react-dom/client";
<<<<<<< HEAD
import App from "./App";
=======
import App, { Root } from "./App";
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
<<<<<<< HEAD
    <App />
=======
    <Root />
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
  </React.StrictMode>
);

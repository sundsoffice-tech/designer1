import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import RenderPage from "./RenderPage";
import "./styles.css";

const isRenderRoute = window.location.pathname.startsWith("/render");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isRenderRoute ? <RenderPage /> : <App />}
  </React.StrictMode>
);

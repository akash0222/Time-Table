import React from "react";
import { BrowserRouter } from "react-router-dom";
import ERPWorkspace from "./app/ERPWorkspace";

export default function App(){
  return (
    <BrowserRouter>
      <ERPWorkspace />
    </BrowserRouter>
  );
}

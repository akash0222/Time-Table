import React from "react";
import App from "./TimeTableApp.jsx";
import PublicShareView from "../pages/PublicShareViewPage.jsx";

export default function Root(){
  const match=window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
  return match?<PublicShareView token={match[1]}/>:<App/>;
}

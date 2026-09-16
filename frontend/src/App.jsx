import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import ChatRoom from "./pages/ChatRoom.jsx";
import Rooms from "./pages/Rooms.jsx";
import GroupRoom from "./pages/GroupRoom.jsx";
import Admin from "./pages/Admin.jsx";
import Profile from "./pages/Profile.jsx";
import Guide from "./pages/Guide.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/chat" element={<ChatRoom />} />
      <Route path="/rooms" element={<Rooms />} />
      <Route path="/rooms/:roomId" element={<GroupRoom />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

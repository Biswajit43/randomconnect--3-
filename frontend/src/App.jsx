import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import ChatRoom from "./pages/ChatRoom.jsx";
import Rooms from "./pages/Rooms.jsx";
import GroupRoom from "./pages/GroupRoom.jsx";
import Admin from "./pages/Admin.jsx";
import Profile from "./pages/Profile.jsx";
import Guide from "./pages/Guide.jsx";
import PublicPage from "./pages/PublicPages.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/chat" element={<ChatRoom />} />
      <Route path="/rooms" element={<Rooms />} />
      <Route path="/room" element={<Rooms />} />
      <Route path="/rooms/:roomId" element={<GroupRoom />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/pricing" element={<PublicPage kind="pricing" />} />
      <Route path="/contact" element={<PublicPage kind="contact" />} />
      <Route path="/about" element={<PublicPage kind="about" />} />
      <Route path="/faq" element={<PublicPage kind="faq" />} />
      <Route path="/privacy" element={<PublicPage kind="privacy" />} />
      <Route path="/terms" element={<PublicPage kind="terms" />} />
      <Route path="/safety" element={<PublicPage kind="safety" />} />
      <Route path="*" element={<PublicPage kind="about" />} />
    </Routes>
  );
}

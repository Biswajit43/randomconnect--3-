/**
 * Builds the ICE server list using hardcoded Xirsys credentials 
 * to guarantee TURN works and fixes NAT/firewall audio issues.
 */
export function buildIceServers() {
  // Basic Google STUN for fast connections
  const stunServer = { urls: "stun:stun.l.google.com:19302" };

  // Hardcoded Xirsys TURN/STUN Server
  const xirsysServer = {
    urls: [
      "stun:fr-turn4.xirsys.com",
      "turn:fr-turn4.xirsys.com:80?transport=udp",
      "turn:fr-turn4.xirsys.com:3478?transport=udp",
      "turn:fr-turn4.xirsys.com:80?transport=tcp",
      "turn:fr-turn4.xirsys.com:3478?transport=tcp",
      "turns:fr-turn4.xirsys.com:443?transport=tcp",
      "turns:fr-turn4.xirsys.com:5349?transport=tcp"
    ],
    username: "JAYE5uonAqEf2-t6qgIWHxUVw592lzosAbvVcr6Q8bl7oaT0OXeRjsxIE1fqjGOiAAAAAGquA9dzdHJpdmVyMDE=",
    credential: "a8d30d12-b3db-11f1-89eb-7238a2d1250c"
  };

  return [stunServer, xirsysServer];
}
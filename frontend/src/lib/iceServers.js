/**
 * Builds the ICE server list using hardcoded Metered TURN credentials.
 * Provides STUN + TURN relay for NAT/firewall traversal across networks.
 */
export function buildIceServers() {
  // Basic Google STUN for fast connections
  const stunServer = { urls: "stun:stun.l.google.com:19302" };

  // Metered STUN (redundant with Google STUN, but harmless)
  const meteredStun = { urls: "stun:stun.relay.metered.ca:80" };

  // Metered TURN (UDP, TCP, and TLS fallbacks)
  const turnUdp = {
    urls: "turn:global.relay.metered.ca:80",
    username: "f8f5cd006693653d883f94fe",
    credential: "j9+nu3Srt896msGU",
  };

  const turnTcp = {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "f8f5cd006693653d883f94fe",
    credential: "j9+nu3Srt896msGU",
  };

  const turnTls = {
    urls: [
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443?transport=tcp",
    ],
    username: "f8f5cd006693653d883f94fe",
    credential: "j9+nu3Srt896msGU",
  };

  return [stunServer, meteredStun, turnUdp, turnTcp, turnTls];
}
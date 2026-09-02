/**
 * Builds the ICE server list from env vars. VITE_TURN_URL accepts a
 * comma-separated list — providers like Metered give you multiple transport
 * options (UDP on 80, TCP on 443, TLS on 443) that all share one
 * username/credential, and listing all of them gives the browser fallback
 * paths when the network blocks one transport but not another. A single
 * TURN entry is fine too; this just also handles the multi-URL case.
 *
 * Example .env value that uses all three Metered transports:
 *   VITE_TURN_URL=turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turns:global.relay.metered.ca:443?transport=tcp
 */
export function buildIceServers() {
  const stunServer = { urls: "stun:stun.l.google.com:19302" };

  const turnUrlEnv = import.meta.env.VITE_TURN_URL;
  if (!turnUrlEnv) {
    // TURN is required in production — without it, calls fail for anyone
    // behind a symmetric NAT or strict firewall (mobile data, corporate/
    // school networks). See frontend/.env.example.
    console.warn(
      "[randomconnect] No VITE_TURN_URL configured — calls will fail for users behind strict NATs/firewalls."
    );
    return [stunServer];
  }

  const turnUrls = turnUrlEnv.split(",").map((u) => u.trim()).filter(Boolean);

  return [
    stunServer,
    {
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    },
  ];
}

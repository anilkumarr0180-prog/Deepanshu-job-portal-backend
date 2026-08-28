import crypto from "crypto";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  ttlSeconds?: number;
}

/**
 * Generate short-lived STUN/TURN credentials using RFC 5766 Time-limited Credential Mechanism
 * Shared secret exists strictly on the server and is never exposed to the frontend.
 */
export const getIceServersConfig = (userId: string): IceServersResponse => {
  const turnSecret = process.env.TURN_SECRET?.trim();
  const turnHost = process.env.TURN_HOST?.trim() || process.env.TURN_URL?.trim();
  const stunUrl = process.env.STUN_URL?.trim();

  // Default fallback Google STUN servers (always available for local & direct P2P NAT traversal)
  const defaultStunServers: IceServerConfig[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ];

  // If custom STUN server is configured, prepend it
  if (stunUrl) {
    defaultStunServers.unshift({ urls: stunUrl });
  }

  // If TURN is not configured (e.g. standard local development), return STUN-only configuration gracefully
  if (!turnSecret || !turnHost) {
    return {
      iceServers: defaultStunServers,
      ttlSeconds: 86400,
    };
  }

  // Generate short-lived HMAC-SHA1 credentials for coturn / standard TURN server
  const ttlSeconds = parseInt(process.env.TURN_TTL || "86400", 10);
  const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiryTimestamp}:${userId}`;

  const hmac = crypto.createHmac("sha1", turnSecret);
  hmac.update(username);
  const credential = hmac.digest("base64");

  // Format TURN URLs (UDP, TCP, and TLS if supported)
  const cleanHost = turnHost.replace(/^(turn:|turns:)/, "");
  const turnUrls: string[] = [
    `turn:${cleanHost}?transport=udp`,
    `turn:${cleanHost}?transport=tcp`,
  ];

  // If running on port 5349 or TURNS enabled, add secure TURNS endpoint
  if (process.env.TURNS_PORT || cleanHost.includes(":5349") || process.env.TURN_USE_TLS === "true") {
    turnUrls.push(`turns:${cleanHost.split(":")[0]}:5349?transport=tcp`);
  }

  const iceServers: IceServerConfig[] = [
    ...defaultStunServers,
    {
      urls: turnUrls,
      username,
      credential,
    },
  ];

  return {
    iceServers,
    ttlSeconds,
  };
};

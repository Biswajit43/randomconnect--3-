export function buildIceServers() {
  return [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: [
        "turn:fr-turn3.xirsys.com:80?transport=udp",
        "turn:fr-turn3.xirsys.com:3478?transport=udp",
        "turn:fr-turn3.xirsys.com:80?transport=tcp",
        "turn:fr-turn3.xirsys.com:3478?transport=tcp",
        "turns:fr-turn3.xirsys.com:443?transport=tcp",
        "turns:fr-turn3.xirsys.com:5349?transport=tcp",
      ],
      username: "dl1ZiNA4RPqE0WVQd8norJA_VgacpVrOXfJ5AIeBGqUzUoLOnLsfLeCZzWzVp4wbAAAAAGqt_xJzdHJpdmVyMDE=",
      credential: "d0cedd9e-b3d8-11f1-85df-42d066fe540c",
    },
  ];
}
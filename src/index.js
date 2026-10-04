import { DurableObject } from "cloudflare:workers";

export class RadioRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Set();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      // Send the broadcaster's message/audio to every
      // other connection in this radio room.
      for (const socket of this.sessions) {
        if (socket === server) continue;

        try {
          socket.send(event.data);
        } catch (error) {
          this.sessions.delete(socket);
        }
      }
    });

    const remove = () => {
      this.sessions.delete(server);
    };

    server.addEventListener("close", remove);
    server.addEventListener("error", remove);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Opening the Worker normally in a browser.
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(
`OCTA/8 Radio Server

Status: ONLINE
Durable Radio Rooms: READY`,
        {
          headers: {
            "content-type": "text/plain; charset=UTF-8"
          }
        }
      );
    }

    // Each station can eventually have its own room.
    const roomName =
      url.searchParams.get("room") || "test";

    const id =
      env.RADIO_ROOM.idFromName(roomName);

    const room =
      env.RADIO_ROOM.get(id);

    return room.fetch(request);
  }
};

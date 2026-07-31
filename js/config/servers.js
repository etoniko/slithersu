/** Единственный игровой сервер (WSS). */
export const SERVER_HOST = "ffa.agar.su:6009";
export const SERVER_WS_URL = `wss://${SERVER_HOST}`;

export const servers = {
  [SERVER_HOST]: { name: "FFA" }
};

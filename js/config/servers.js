/** Единственный игровой сервер (WSS через прокси sixz.ru). */
export const SERVER_HOST = "sixz.ru:6009";
export const SERVER_WS_URL = `wss://${SERVER_HOST}`;

export const servers = {
  [SERVER_HOST]: { name: "FFA" }
};

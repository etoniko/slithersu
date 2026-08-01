/** Единственный игровой сервер (WSS через прокси sixz.ru). */
export const SERVER_HOST = "sixz.ru/slither";
export const SERVER_WS_URL = `wss://${SERVER_HOST}`;

export const servers = {
  [SERVER_HOST]: { name: "FFA" }
};

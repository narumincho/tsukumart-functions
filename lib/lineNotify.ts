import * as express from "express";
import * as database from "./database";
import axios, { AxiosResponse } from "axios";
import { URLSearchParams } from "url";
import * as key from "./key";

export const callBack = async (
  request: express.Request,
  response: express.Response
): Promise<void> => {
  const code: unknown = request.query.code;
  const state: unknown = request.query.state;
  if (!(typeof code === "string" && typeof state === "string")) {
    console.log(
      "LINE Notifyの設定で、codeかstateが送られて来なかった。ユーザーがキャンセルした?"
    );
    response.redirect("https://tsukumart.com/");
    return;
  }
  const userId = await database.checkExistsLineNotifyState(state);

  if (userId === null) {
    console.log("LINE Notifyで生成していないstateを指定された", state);
    response.send(
      `LINE Notify Error: tsukumart do not generate state =${state}`
    );
    return;
  }

  try {
    const accessToken = await responseToAccessToken(
      await axios.post(
        "https://notify-bot.line.me/oauth/token",
        new URLSearchParams(
          new Map([
            ["grant_type", "authorization_code"],
            ["code", code],
            ["redirect_uri", key.lineNotifyRedirectUri],
            ["client_id", key.lineNotifyClientId],
            ["client_secret", key.lineNotifySecret],
          ])
        ).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
    );

    console.log("LINE Notify用のトークンを得た");
    await sendMessage(
      "つくマートから通知を登録できたことをお知らせします!",
      true,
      accessToken
    );
    console.log("メッセージを送信した!");

    await database.saveNotifyToken(userId, accessToken);
    response.redirect("https://tsukumart.com/");
  } catch (error) {
    console.log("LINE Notifyのエラーだな");
    console.log(
      (error.response as AxiosResponse<{
        status: number;
        message: string;
      }>).data
    );

    response.send("LINE Notifyのエラーだ。悲しい😥");
    return;
  }
};

const responseToAccessToken = (
  response: AxiosResponse<{ access_token: string }>
) => {
  return response.data.access_token;
};

export const sendMessage = async (
  message: string,
  sticker: boolean,
  accessToken: string
): Promise<void> => {
  const args = new Map(
    sticker
      ? [
          ["message", message],
          ["stickerPackageId", "2"],
          ["stickerId", "171"],
        ]
      : [["message", message]]
  );
  await axios
    .post(
      "https://notify-api.line.me/api/notify",
      new URLSearchParams(args).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Bearer " + accessToken,
        },
      }
    )
    .catch((e) => e.response);
};

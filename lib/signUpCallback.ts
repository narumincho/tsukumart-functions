import axios, { AxiosResponse } from "axios";
import * as express from "express";
import * as jwt from "jsonwebtoken";
import { URL, URLSearchParams } from "url";
import * as database from "./database";
import * as key from "./key";
import * as type from "./type";
import * as utilUrl from "./util/url";

const domain = "tsukumart.com";
/**
 * アクセストークンがフラグメントに含まれたURLを作成
 * @param accessToken アクセストークン
 */
const tokenUrl = (accessToken: string): URL =>
  utilUrl.fromStringWithFragment(
    domain,
    new Map([["accessToken", accessToken]])
  );

/**
 * 新規登録フォームへのURLを作成
 * @param sendEmailToken
 * @param name
 * @param imageId
 */
const signUpUrl = (
  sendEmailToken: string,
  name: string,
  imageId: string
): URL =>
  utilUrl.fromStringWithFragment(
    domain + "/signup",
    new Map([
      ["sendEmailToken", sendEmailToken],
      ["name", name],
      ["imageId", imageId],
    ])
  );

/**
 * 認証メールを送るのに必要なトークン
 * @param id データベースで作成したID
 */
const createSendEmailToken = (id: type.LogInServiceAndId) => {
  const time = new Date();
  time.setUTCMinutes(time.getUTCMinutes() + 30); // 有効期限は30分後
  const payload = {
    sub: type.logInServiceAndIdToString(id),
    exp: Math.round(time.getTime() / 1000),
  };
  return jwt.sign(payload, key.sendEmailTokenSecret, { algorithm: "HS256" });
};

const getAndSaveUserImage = async (imageId: URL): Promise<string> => {
  const response: AxiosResponse<Buffer> = await axios.get(imageId.toString(), {
    responseType: "arraybuffer",
  });
  const mimeType: string = response.headers["content-type"];
  return await database.saveImage(response.data, mimeType);
};

/* =====================================================================
 *                              LINE
 * =====================================================================
 */
/** LINEでログインしたあとのリダイレクト先 */
export const lineLogInReceiver = async (
  request: express.Request,
  response: express.Response
): Promise<void> => {
  console.log("lineLogInCodeReceiver", request.query);
  const code: unknown = request.query.code;
  const state: unknown = request.query.state;
  if (!(typeof code === "string" && typeof state === "string")) {
    console.log(
      "LINEからcodeかstateが送られて来なかった。ユーザーがキャンセルした?"
    );
    response.redirect(utilUrl.fromString(domain).toString());
    return;
  }
  if (!(await database.checkExistsLogInState(state, "line"))) {
    console.log("lineのログインで生成していないstateを指定された", state);
    response.send(
      `LINE LogIn Error: tsukumart do not generate state =${state}`
    );
    return;
  }

  // ここでhttps://api.line.me/oauth2/v2.1/tokenにqueryのcodeをつけて送信。IDトークンを取得する
  const lineData = await lineTokenResponseToData(
    await axios.post(
      "https://api.line.me/oauth2/v2.1/token",
      new URLSearchParams(
        new Map([
          ["grant_type", "authorization_code"],
          ["code", code],
          ["redirect_uri", key.lineLogInRedirectUri],
          ["client_id", key.lineLogInClientId],
          ["client_secret", key.lineLogInSecret],
        ])
      ).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    )
  );
  const logInServiceAndId: type.LogInServiceAndId = {
    service: "line",
    serviceId: lineData.id,
  };

  try {
    // ユーザーを探す
    response.redirect(
      tokenUrl(
        await database.getAccessTokenFromLogInAccountService(logInServiceAndId)
      ).toString()
    );
  } catch {
    const imageId = await getAndSaveUserImage(new URL(lineData.picture));
    await database.addUserInUserBeforeInputData(
      logInServiceAndId,
      lineData.name,
      imageId
    );
    response.redirect(
      signUpUrl(
        createSendEmailToken(logInServiceAndId),
        lineData.name,
        imageId
      ).toString()
    );
  }
};

/**
 * 取得したidトークンからプロフィール画像と名前とLINEのIDを取得する
 */
const lineTokenResponseToData = (
  response: AxiosResponse<{ id_token: string }>
): {
  id: string;
  name: string;
  picture: string;
} => {
  const idToken = response.data.id_token;
  console.log("lineToken id_token=", idToken);
  const decoded = jwt.verify(idToken, key.lineLogInSecret, {
    algorithms: ["HS256"],
  });
  if (typeof decoded === "string") {
    throw new Error("LINE jwt include string only!");
  }
  const markedDecoded = decoded as {
    iss: unknown;
    sub: unknown;
    name: unknown;
    picture: unknown;
  };
  if (
    markedDecoded.iss !== "https://access.line.me" ||
    typeof markedDecoded.name !== "string" ||
    typeof markedDecoded.sub !== "string" ||
    typeof markedDecoded.picture !== "string"
  ) {
    throw new Error("LINEから送られてきたトークンがおかしい");
  }

  return {
    id: markedDecoded.sub,
    name: markedDecoded.name,
    picture: markedDecoded.picture,
  };
};

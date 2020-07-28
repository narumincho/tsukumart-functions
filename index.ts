import * as functions from "firebase-functions";
import * as graphqlExpress from "express-graphql";
import * as database from "./lib/database";
import * as databaseLow from "./lib/databaseLow";
import * as signUpCallback from "./lib/signUpCallback";
import * as lineNotify from "./lib/lineNotify";
import * as libSchema from "./lib/schema";
import * as html from "@narumincho/html";
import { URL } from "url";

console.log("サーバーのプログラムが読み込まれた!");

export const indexHtml = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    if (request.hostname !== "tsukumart.com") {
      response.redirect("https://tsukumart.com");
    }
    const descriptionAndImageUrl = await pathToDescriptionAndImageUrl(
      request.path
    );

    response.setHeader("content-type", "text/html");
    response.send(
      html.toString({
        appName: "つくマート",
        pageName: descriptionAndImageUrl.title,
        iconPath: ["assets", "logo_bird.png"],
        coverImageUrl: descriptionAndImageUrl.imageUrl,
        description: descriptionAndImageUrl.description,
        scriptUrlList: [
          new URL("https://tsukumart.com/main.js"),
          new URL("https://www.gstatic.com/firebasejs/7.15.1/firebase-app.js"),
          new URL(
            "https://www.gstatic.com/firebasejs/7.15.1/firebase-firestore.js"
          ),
          new URL("https://tsukumart.com/__/firebase/init.js"),
          new URL("https://tsukumart.com/call.js"),
        ],
        javaScriptMustBeAvailable: true,
        styleUrlList: [],
        twitterCard: html.TwitterCard.SummaryCardWithLargeImage,
        language: html.Language.Japanese,
        manifestPath: ["manifest.json"],
        url: new URL("https://tsukumart.com/" + request.path),
        themeColor: "#733fa7",
        style: `html {
          height: 100%;
      }

      body {
          margin: 0;
          height: 100%;
      }`,
        body: [html.div({}, "つくマート読み込み中……")],
      })
    );
  });

const pathToDescriptionAndImageUrl = async (
  path: string
): Promise<{
  title: string;
  description: string;
  imageUrl: URL;
}> => {
  const productMathResult = path.match(/^\/product\/(\w+)$/);
  if (productMathResult !== null) {
    const product = await database.getProduct(productMathResult[1]);
    return {
      title: product.name,
      description: `${product.name} | ${product.description}`,
      imageUrl: new URL(
        "https://asia-northeast1-tsukumart-f0971.cloudfunctions.net/image/" +
          product.thumbnailImageId
      ),
    };
  }
  const userMathResult = path.match(/^\/user\/(\w+)$/);
  if (userMathResult !== null) {
    const user = await database.getUserData(userMathResult[1]);
    return {
      title: user.displayName,
      description: `${user.displayName}さんのプロフィール | ${user.introduction}`,
      imageUrl: new URL(
        "https://asia-northeast1-tsukumart-f0971.cloudfunctions.net/image/" +
          user.imageId
      ),
    };
  }
  return {
    title: "つくマート",
    description: "筑波大生専用手渡しフリーマーケットサービス",
    imageUrl: new URL("https://tsukumart.com/assets/logo_bird.png"),
  };
};

/** API */
export const api = functions
  .region("asia-northeast1")
  .runWith({
    memory: "2GB",
  })
  .https.onRequest(async (request, response) => {
    console.log("API called");
    response.setHeader("access-control-allow-origin", "https://tsukumart.com");
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.status(200).send("");
      return;
    }
    await graphqlExpress({ schema: libSchema.schema, graphiql: true })(
      request,
      response
    );
  });

/* =====================================================================
 *             ソーシャルログインをしたあとのリダイレクト先
 * =====================================================================
 */
export const logInReceiver = functions
  .region("asia-northeast1")
  .https.onRequest(
    async (request, response): Promise<void> => {
      switch (request.path) {
        case "/line":
          await signUpCallback.lineLogInReceiver(request, response);
      }
    }
  );

/* =====================================================================
 *                       LINE Notifyのコールバック
 * =====================================================================
 */
export const notifyCallBack = functions
  .region("asia-northeast1")
  .https.onRequest(
    async (request, response): Promise<void> => {
      await lineNotify.callBack(request, response);
    }
  );
/* =====================================================================
 *                           画像を配信する
 * =====================================================================
 */
export const image = functions
  .region("asia-northeast1")
  .https.onRequest(async (request, response) => {
    response.setHeader("access-control-allow-origin", "https://tsukumart.com");
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.status(200).send("");
      return;
    }
    try {
      response.setHeader("cache-control", "public, max-age=31536000");
      databaseLow
        .getImageReadStream(request.path.substring(1)) // /imageId -> imageId
        .pipe(response);
    } catch (e) {
      console.log(`指定した、ファイルID=(${request.path.substring(1)})がない`);
      response.status(404).send("not found");
    }
  });

/* =====================================================================
 *                  Google Search Console 用サイトマップ
 * =====================================================================
 */
export const sitemap = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    console.log("sitemap called");
    const productData = await database.getAllProducts();
    const userData = await database.getAllUserId();

    response.setHeader("content-type", "application/xml");
    response.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pathToXml("")}
${productData.map((product) => pathToXml("product/" + product.id)).join("\n")}
${userData.map((id) => pathToXml("user/" + id)).join("\n")}
</urlset>`);
  });

const pathToXml = (path: string): string => `
    <url>
        <loc>https://tsukumart.com/${path}</loc>
        <lastmod>2019-07-12</lastmod>
    </url>
`;

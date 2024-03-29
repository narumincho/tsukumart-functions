import * as database from "./database";
import * as databaseLow from "./databaseLow";
import * as functions from "firebase-functions";
import * as http from "http";
import * as libSchema from "./schema";
import * as lineNotify from "./lineNotify";
import * as signUpCallback from "./signUpCallback";
import { graphqlHTTP } from "express-graphql";
import { html as htmlGen } from "@narumincho/gen";

console.log("サーバーのプログラムが読み込まれた!");

/*
 * =====================================================================
 *                        OGP 付きの HTML 配信
 * =====================================================================
 */
export const html = functions
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
      htmlGen.htmlOptionToString({
        appName: "つくマート",
        pageName: descriptionAndImageUrl.title,
        iconUrl: new URL("https://tsukumart.com/assets/logo_bird.png"),
        coverImageUrl: descriptionAndImageUrl.imageUrl,
        description: descriptionAndImageUrl.description,
        scriptUrlList: [new URL("https://tsukumart.com/assets/index.js")],
        styleUrlList: [],
        twitterCard: "SummaryCardWithLargeImage",
        language: "Japanese",
        webAppManifestUrl: new URL("https://tsukumart.com/manifest.json"),
        url: new URL("https://tsukumart.com/" + request.path),
        themeColor: { r: 115 / 255, g: 63 / 255, b: 167 / 255 },
        style: `html {
          height: 100%;
      }

      body {
          margin: 0;
          height: 100%;
      }`,
        bodyClass: "dummy",
        children: [htmlGen.div({}, "つくマート読み込み中……")],
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
  const productMathResult = path.match(/^\/product\/(?<id>\w+)$/u);
  if (productMathResult !== null && productMathResult.groups !== undefined) {
    const product = await database.getProduct(productMathResult.groups.id);
    return {
      title: product.name,
      description: `${product.name} | ${product.description}`,
      imageUrl: new URL(
        "https://asia-northeast1-tsukumart-f0971.cloudfunctions.net/image/" +
          product.thumbnailImageId
      ),
    };
  }
  const userMathResult = path.match(/^\/user\/(?<id>\w+)$/u);
  if (userMathResult !== null && userMathResult.groups !== undefined) {
    const user = await database.getUserData(userMathResult.groups.id);
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

/*
 * =====================================================================
 *                            GraphQL API
 * =====================================================================
 */
export const api = functions
  .region("asia-northeast1")
  .runWith({
    memory: "2GB",
  })
  .https.onRequest(async (request, response) => {
    console.log("API called");
    if (supportCrossOriginResourceSharing(request, response)) {
      return;
    }
    await graphqlHTTP({ schema: libSchema.schema, graphiql: true })(
      request,
      response as http.ServerResponse
    );
  });

/*
 * =====================================================================
 *             ソーシャルログインをしたあとのリダイレクト先
 * =====================================================================
 */
export const logInReceiver = functions
  .region("asia-northeast1")
  .https.onRequest(async (request, response): Promise<void> => {
    switch (request.path) {
      case "/line":
        await signUpCallback.lineLogInReceiver(request, response);
    }
  });

/*
 * =====================================================================
 *                       LINE Notifyのコールバック
 * =====================================================================
 */
export const notifyCallBack = functions
  .region("asia-northeast1")
  .https.onRequest(async (request, response): Promise<void> => {
    await lineNotify.callBack(request, response);
  });
/*
 * =====================================================================
 *                           画像を配信する
 * =====================================================================
 */
export const image = functions
  .region("asia-northeast1")
  .https.onRequest((request, response) => {
    if (supportCrossOriginResourceSharing(request, response)) {
      return;
    }
    try {
      response.setHeader("cache-control", "public, max-age=31536000");
      databaseLow
        // /imageId -> imageId
        .getImageReadStream(request.path.substring(1))
        .pipe(response);
    } catch (e) {
      console.log(`指定した、ファイルID=(${request.path.substring(1)})がない`);
      response.status(404).send("not found");
    }
  });

/**
 * CrossOriginResourceSharing の 処理をする.
 * @returns true → メインの処理をしなくていい, false → メインの処理をする必要がある
 */
const supportCrossOriginResourceSharing = (
  request: functions.https.Request,
  response: functions.Response
): boolean => {
  response.setHeader("vary", "Origin");
  response.setHeader(
    "access-control-allow-origin",
    allowOrigin(request.headers.origin)
  );
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.status(200).send("");
    return true;
  }
  return false;
};

const allowOrigin = (httpHeaderOrigin: unknown): string => {
  if (
    httpHeaderOrigin === "http://localhost:2520" ||
    httpHeaderOrigin === "https://tsukumart.com" ||
    httpHeaderOrigin === "https://studio.apollographql.com"
  ) {
    return httpHeaderOrigin;
  }
  return "https://tsukumart.com";
};

/*
 * =====================================================================
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

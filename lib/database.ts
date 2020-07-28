import * as jwt from "jsonwebtoken";
import * as databaseLow from "./databaseLow";
import * as key from "./key";
import * as type from "./type";
import * as lineNotify from "./lineNotify";
import { firestore } from "firebase-admin";

/**
 * 指定したStateがつくマート自身が発行したものかどうか調べ、あったらそのStateを削除する
 * @param state state
 * @param service サービス
 */
export const checkExistsLogInState = async (
  state: string,
  service: "line"
): Promise<boolean> => {
  switch (service) {
    case "line": {
      return databaseLow.existsLineLogInStateAndDelete(state);
    }
  }
};

/**
 * 指定したstateがつくマートが発行したものかどうか調べ、あったらそのstateを削除する
 * @param state
 */
export const checkExistsLineNotifyState = async (
  state: string
): Promise<string | null> =>
  databaseLow.existsLineNotifyStateAndDeleteAndGetUserId(state);

/**
 * LINEへの OpenId ConnectのStateを生成して保存する
 * リプレイアタックを防いだり、他のサーバーがつくマートのクライアントIDを使って発行しても自分が発行したものと見比べて識別できるようにする
 */
export const generateAndWriteLineLogInState = async (): Promise<string> =>
  await databaseLow.generateAndWriteLineLogInState();

/**
 * LINE Notifyの、CSRF攻撃に対応するためのトークンを生成して保存する
 * リプレイアタックを防いだり、他のサーバーがつくマートのクライアントIDを使って発行しても自分が発行したものと見比べて識別できるようにする
 */
export const generateAndWriteLineNotifyState = async (
  userId: string
): Promise<string> => await databaseLow.generateAndWriteLineNotifyState(userId);

/**
 * ユーザー情報を入力する前のユーザーを保存する
 * @param logInServiceAndId 使うアカウントのサービスとそれぞれのアカウントのユーザーID
 * @param name 各サービスのアカウント名
 * @param imageId つくマートのサーバーにダウンロードしたアカウント画像の画像ID
 */
export const addUserInUserBeforeInputData = async (
  logInServiceAndId: type.LogInServiceAndId,
  name: string,
  imageId: string
): Promise<void> => {
  await databaseLow.addUserBeforeInputData(logInServiceAndId, {
    name,
    imageId: imageId,
    createdAt: databaseLow.getNowTimestamp(),
  });
};

/**
 * ユーザー情報を入力する前のユーザー情報を取得し削除する
 * @param logInAccountServiceId サービス名_サービス内でのID
 */
export const getUserInUserBeforeInputData = async (
  logInAccountServiceId: type.LogInServiceAndId
): Promise<{
  name: string;
  imageId: string;
}> => {
  const data = await databaseLow.getAndDeleteUserBeforeInputData(
    logInAccountServiceId
  );
  return {
    name: data.name,
    imageId: data.imageId,
  };
};

export const addUserBeforeEmailVerification = async (
  logInAccountServiceId: type.LogInServiceAndId,
  name: string,
  imageId: string,
  email: string,
  university: type.University
): Promise<string> => {
  const uid = await databaseLow.createFirebaseAuthUserByRandomPassword(
    email,
    name
  );
  const flatUniversity = type.universityToInternal(university);
  await databaseLow.addUserBeforeEmailVerification(logInAccountServiceId, {
    firebaseAuthUserId: uid,
    name: name,
    imageId: imageId,
    schoolAndDepartment: flatUniversity.schoolAndDepartment,
    graduate: flatUniversity.graduate,
    email: email,
    createdAt: databaseLow.getNowTimestamp(),
  });
  return await databaseLow.createCustomToken(uid);
};

/**
 * ソーシャルログインのアカウントIDからアクセストークンを得る
 * @param logInAccountServiceId
 */
export const getAccessTokenFromLogInAccountService = async (
  logInAccountServiceId: type.LogInServiceAndId
): Promise<string> => {
  const userDataMaybe = await databaseLow.getUserByLogInServiceAndId(
    logInAccountServiceId
  );
  // 1回以上ログインしたユーザーに存在するなら
  if (userDataMaybe !== null) {
    const randomStateForIsLastIssue = createRandomStateForIsLastIssueId();
    await databaseLow.updateRandomState(
      randomStateForIsLastIssue,
      userDataMaybe.id
    );
    return createAccessToken(userDataMaybe.id, randomStateForIsLastIssue);
  }

  // ユーザーが存在するなら (メール認証から初回)
  const userBeforeEmailVerification = await databaseLow.getUserBeforeEmailVerification(
    logInAccountServiceId
  );
  if (userBeforeEmailVerification !== undefined) {
    if (
      await databaseLow.getFirebaseAuthUserEmailVerified(
        userBeforeEmailVerification.firebaseAuthUserId
      )
    ) {
      console.log("メールで認証済み", userBeforeEmailVerification);
      const randomStateForIsLastIssueId = createRandomStateForIsLastIssueId();
      const newUserId = await databaseLow.addUserData({
        displayName: userBeforeEmailVerification.name,
        imageId: userBeforeEmailVerification.imageId,
        schoolAndDepartment: userBeforeEmailVerification.schoolAndDepartment,
        graduate: userBeforeEmailVerification.graduate,
        introduction: "",
        createdAt: databaseLow.getNowTimestamp(),
        soldProducts: [],
      });
      await databaseLow.addUserPrivateData(newUserId, {
        logInAccountServiceId: type.logInServiceAndIdToString(
          logInAccountServiceId
        ),
        lastAccessTokenId: randomStateForIsLastIssueId,
        emailAddress: userBeforeEmailVerification.email,
        traded: [],
        trading: [],
        boughtProduct: [],
        commentedProduct: [],
        historyViewProduct: [],
        likedProduct: [],
        notifyToken: null,
      });
      await databaseLow.deleteUserBeforeEmailVerification(
        logInAccountServiceId
      );

      return createAccessToken(newUserId, randomStateForIsLastIssueId);
    }
    console.log("メールで認証済みでない" + logInAccountServiceId);
    throw new Error("email not verified");
  }

  console.log("ユーザーが存在しなかった" + logInAccountServiceId);
  throw new Error("user dose not exists");
};

/**
 * アクセストークンの正当性チェックとidの取得
 * @param accessToken
 * @throws {Error} invalid access token
 */
export const verifyAccessToken = async (
  accessToken: string
): Promise<string> => {
  const decoded = jwt.verify(accessToken, key.accessTokenSecretKey, {
    algorithms: ["HS256"],
  }) as { sub: unknown; jti: unknown };
  if (typeof decoded.sub !== "string" || typeof decoded.jti !== "string") {
    throw new Error("invalid access token");
  }
  const userData = await databaseLow.getUserPrivateData(decoded.sub);
  if (userData.lastAccessTokenId !== decoded.jti) {
    throw new Error("他の端末でログインされたので、ログインしなおしてください");
  }
  return decoded.sub;
};

/**
 * アクセストークンを作成する
 * @param userId つくマート内でのユーザーID
 * @param randomStateForIsLastIssue 最後にソーシャルログインしたものだけを有効にするため
 */
const createAccessToken = (
  userId: string,
  randomStateForIsLastIssue: string
): string => {
  const payload = {
    sub: userId,
    jti: randomStateForIsLastIssue, // 最後に発行したものか調べる用
  };
  /** アクセストークン */
  return jwt.sign(payload, key.accessTokenSecretKey, { algorithm: "HS256" });
};

const createRandomStateForIsLastIssueId = (): string => {
  let id = "";
  const charTable =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 15; i++) {
    id += charTable[(Math.random() * charTable.length) | 0];
  }
  return id;
};

/* ==========================================
                    User
   ==========================================
*/
export type UserReturnLowConst = Pick<
  type.UserPrivate,
  "id" | "displayName" | "imageId" | "introduction" | "university" | "createdAt"
> & {
  soldProductAll: Array<{ id: string }>;
  boughtProductAll: Array<{ id: string }>;
  tradingAll: Array<{ id: string }>;
  tradedAll: Array<{ id: string }>;
  likedProduct: Array<{ id: string }>;
  historyViewProduct: Array<{ id: string }>;
  commentedProduct: Array<{ id: string }>;
};

/**
 * 指定したユーザーの情報を取得する
 * @param id ユーザーID
 */
export const getUserData = async (id: string): Promise<UserReturnLowConst> =>
  databaseLowUserDataToUserDataLowCost({
    id: id,
    data: await databaseLow.getUserData(id),
    privateData: await databaseLow.getUserPrivateData(id),
  });

const databaseLowUserDataToUserDataLowCost = (rec: {
  id: string;
  data: databaseLow.UserData;
  privateData: databaseLow.UserPrivateData;
}): UserReturnLowConst => ({
  id: rec.id,
  displayName: rec.data.displayName,
  imageId: rec.data.imageId,
  introduction: rec.data.introduction,
  university: type.universityFromInternal({
    graduate: rec.data.graduate,
    schoolAndDepartment: rec.data.schoolAndDepartment,
  }),
  createdAt: databaseLow.timestampToDate(rec.data.createdAt),
  soldProductAll: rec.data.soldProducts.map((id) => ({ id: id })),
  boughtProductAll: rec.privateData.boughtProduct.map((id) => ({ id: id })),
  tradingAll: rec.privateData.trading.map((id) => ({ id })),
  tradedAll: rec.privateData.traded.map((id) => ({ id })),
  historyViewProduct: rec.privateData.historyViewProduct.map((id) => ({ id })),
  likedProduct: rec.privateData.likedProduct.map((id) => ({ id })),
  commentedProduct: rec.privateData.commentedProduct.map((id) => ({ id })),
});

/**
 * すべてのユーザーIDを取得する
 */
export const getAllUserId = async (): Promise<Array<string>> =>
  (await databaseLow.getAllUserData()).map((rec) => rec.id);

export const markProductInHistory = async (
  userId: string,
  productId: string
): Promise<ProductReturnLowCost> => {
  await databaseLow.addHistoryViewProductData(userId, productId);
  await databaseLow.updateProductData(productId, {
    viewedCount: (await databaseLow.getProduct(productId)).viewedCount + 1,
  });
  return productReturnLowCostFromDatabaseLow({
    id: productId,
    data: await databaseLow.getProduct(productId),
  });
};

export const addCommentProduct = async (
  userId: string,
  productId: string,
  data: Pick<type.ProductComment, "body">
): Promise<ProductReturnLowCost> => {
  const trimmedCommentBody = data.body.trim();
  if (trimmedCommentBody.length === 0) {
    throw new Error("コメントには1文字以上必要です");
  }
  const now = databaseLow.getNowTimestamp();
  const userData = await databaseLow.getUserData(userId);
  await databaseLow.addCommentedProductData(userId, productId);
  await databaseLow.addProductComment(productId, {
    body: trimmedCommentBody,
    createdAt: now,
    speakerId: userId,
    speakerDisplayName: userData.displayName,
    speakerImageId: userData.imageId,
  });
  const productData = await databaseLow.getProduct(productId);
  const notifyAccessToken = (
    await databaseLow.getUserPrivateData(productData.sellerId)
  ).notifyToken;
  if (notifyAccessToken !== null) {
    await lineNotify.sendMessage(
      `${userData.displayName}さんが${productData.name}にコメントをつけました。\n\n${trimmedCommentBody}\n\nhttps://tsukumart.com/product/${productId}`,
      false,
      notifyAccessToken
    );
  }
  return productReturnLowCostFromDatabaseLow({
    id: productId,
    data: await databaseLow.getProduct(productId),
  });
};

export const updateProduct = async (
  userId: string,
  productId: string,
  data: Pick<
    type.Product,
    "name" | "description" | "price" | "condition" | "category"
  > & {
    addImageList: Array<type.DataURL>;
    deleteImageIndex: Array<number>;
  }
): Promise<ProductReturnLowCost> => {
  const nowTime = databaseLow.getNowTimestamp();
  const beforeData = await databaseLow.getProduct(productId);
  if (beforeData.sellerId !== userId) {
    throw new Error("出品者以外が商品を編集しようとしている");
  }
  if (beforeData.status !== "selling") {
    throw new Error("売り出し時以外の商品を編集しようとしている");
  }

  const newImageData = await updateProductImage(
    beforeData.thumbnailImageId,
    beforeData.imageIds,
    data.addImageList,
    data.deleteImageIndex
  );
  await databaseLow.updateProductData(productId, {
    name: data.name,
    price: data.price,
    description: data.description,
    category: data.category,
    condition: data.condition,
    updateAt: nowTime,
    imageIds: newImageData.imageIds,
  });
  return {
    id: productId,
    name: data.name,
    price: data.price,
    description: data.description,
    category: data.category,
    condition: data.condition,
    createdAt: databaseLow.timestampToDate(beforeData.createdAt),
    updateAt: databaseLow.timestampToDate(nowTime),
    thumbnailImageId: newImageData.thumbnailImageId,
    imageIds: newImageData.imageIds,
    likedCount: beforeData.likedCount,
    viewedCount: beforeData.viewedCount,
    status: beforeData.status,
    seller: {
      id: beforeData.sellerId,
      displayName: beforeData.sellerDisplayName,
      imageId: beforeData.sellerImageId,
    },
  };
};

export const deleteProduct = async (userId: string, productId: string) => {
  const now = databaseLow.getNowTimestamp();
  const userData = await databaseLow.getUserData(userId);
  if (!userData.soldProducts.includes(productId)) {
    throw new Error("自分が出品した商品以外を削除しようとした");
  }
  const productData = await databaseLow.getProduct(productId);
  if (productData.status !== "selling") {
    throw new Error("商品が売出し中のとき以外に削除しようとした");
  }
  await databaseLow.addDeletedProduct({ ...productData, deletedAt: now });
  await databaseLow.deleteProduct(productId);
};

export const addDraftProductData = async (
  userId: string,
  data: Pick<
    type.DraftProduct,
    "name" | "price" | "description" | "condition" | "category"
  > & { images: Array<type.DataURL> }
): Promise<type.DraftProduct> => {
  const nowTime = databaseLow.getNowTimestamp();
  const nowTimeAsDate = databaseLow.timestampToDate(nowTime);
  const thumbnailImageId = await databaseLow.saveThumbnailImageToCloudStorage(
    data.images[0].data,
    data.images[0].mimeType
  );
  const imageIds = await Promise.all(
    data.images.map(({ data, mimeType }) =>
      databaseLow.saveFileToCloudStorage(data, mimeType)
    )
  );

  return {
    draftId: await databaseLow.addDraftProductData(userId, {
      name: data.name,
      description: data.description,
      price: data.price,
      condition: data.condition,
      category: data.category,
      thumbnailImageId: thumbnailImageId,
      imageIds: imageIds,
      createdAt: nowTime,
      updateAt: nowTime,
    }),
    name: data.name,
    price: data.price,
    description: data.description,
    condition: data.condition,
    category: data.category,
    thumbnailImageId: thumbnailImageId,
    imageIds: imageIds,
    createdAt: nowTimeAsDate,
    updateAt: nowTimeAsDate,
  };
};

export const getDraftProducts = async (
  userId: string
): Promise<Array<type.DraftProduct>> =>
  (await databaseLow.getAllDraftProductData(userId)).map(({ id, data }) => ({
    draftId: id,
    name: data.name,
    price: data.price,
    description: data.description,
    condition: data.condition,
    category: data.category,
    thumbnailImageId: data.thumbnailImageId,
    imageIds: data.imageIds,
    createdAt: databaseLow.timestampToDate(data.createdAt),
    updateAt: databaseLow.timestampToDate(data.createdAt),
  }));
export const updateDraftProduct = async (
  userId: string,
  data: Pick<
    type.DraftProduct,
    "draftId" | "name" | "price" | "description" | "category" | "condition"
  > & { deleteImagesAt: Array<number>; addImages: Array<type.DataURL> }
): Promise<type.DraftProduct> => {
  const nowTime = databaseLow.getNowTimestamp();
  const beforeData = await databaseLow.getDraftProductData(
    userId,
    data.draftId
  );

  const newImageData = await updateProductImage(
    beforeData.thumbnailImageId,
    beforeData.imageIds,
    data.addImages,
    data.deleteImagesAt
  );
  await databaseLow.updateDraftProduct(userId, data.draftId, {
    name: data.name,
    price: data.price,
    description: data.description,
    category: data.category,
    condition: data.condition,
    updateAt: nowTime,
    imageIds: newImageData.imageIds,
  });
  return {
    draftId: data.draftId,
    name: data.name,
    price: data.price,
    description: data.description,
    category: data.category,
    condition: data.condition,
    createdAt: databaseLow.timestampToDate(beforeData.createdAt),
    updateAt: databaseLow.timestampToDate(nowTime),
    thumbnailImageId: newImageData.thumbnailImageId,
    imageIds: newImageData.imageIds,
  };
};

export const deleteDraftProduct = async (
  userId: string,
  draftId: string
): Promise<void> => {
  await databaseLow.deleteDraftProduct(userId, draftId);
};

const updateProductImage = async (
  thumbnailImageId: string,
  beforeImageId: Array<string>,
  addImages: Array<type.DataURL>,
  deleteImagesAt: Array<number>
): Promise<{
  thumbnailImageId: string;
  imageIds: Array<string>;
}> => {
  const newImageIds: Array<string> = [];
  let restFirstImage: boolean = true;
  let deleteAtIndex = 0;
  for (let i = 0; i < beforeImageId.length; i++) {
    if (i === deleteImagesAt[deleteAtIndex]) {
      if (i === 0) {
        restFirstImage = false;
      }
      deleteAtIndex += 1;
    } else {
      newImageIds.push(beforeImageId[i]);
    }
  }
  for (let i = 0; i < addImages.length; i++) {
    newImageIds.push(
      await databaseLow.saveFileToCloudStorage(
        addImages[i].data,
        addImages[i].mimeType
      )
    );
  }
  if (newImageIds.length <= 0) {
    throw new Error("商品画像がなくなってしまった");
  }
  if (!restFirstImage) {
    return {
      thumbnailImageId: await databaseLow.saveThumbnailImageFromCloudStorageToCloudStorage(
        newImageIds[0]
      ),
      imageIds: newImageIds,
    };
  }
  return {
    thumbnailImageId: thumbnailImageId,
    imageIds: newImageIds,
  };
};

/**
 * プロフィールを設定する
 * @param id ユーザーID
 */
export const setProfile = async (
  id: string,
  data: { image: type.DataURL | undefined | null } & Pick<
    type.UserPrivate,
    "displayName" | "introduction" | "university"
  >
): Promise<
  Pick<
    type.UserPrivate,
    "id" | "displayName" | "imageId" | "introduction" | "university"
  >
> => {
  let imageId: string;
  const universityInternal = type.universityToInternal(data.university);
  if (data.image === null || data.image === undefined) {
    databaseLow.updateUserData(id, {
      displayName: data.displayName,
      introduction: data.introduction,
      graduate: universityInternal.graduate,
      schoolAndDepartment: universityInternal.schoolAndDepartment,
    });
    imageId = (await databaseLow.getUserData(id)).imageId;
  } else {
    imageId = await databaseLow.saveFileToCloudStorage(
      data.image.data,
      data.image.mimeType
    );
    databaseLow.updateUserData(id, {
      displayName: data.displayName,
      imageId: imageId,
      introduction: data.introduction,
      graduate: universityInternal.graduate,
      schoolAndDepartment: universityInternal.schoolAndDepartment,
    });
  }
  return {
    id: id,
    displayName: data.displayName,
    imageId: imageId,
    introduction: data.introduction,
    university: data.university,
  };
};

export const saveImage = async (
  data: Buffer,
  mimeType: string
): Promise<string> => await databaseLow.saveFileToCloudStorage(data, mimeType);

export const deleteImage = async (imageId: string): Promise<void> => {
  await databaseLow.deleteStorageFile(imageId);
};

/* ==========================================
                    Product
   ==========================================
*/
type ProductReturnLowCost = Pick<
  type.Product,
  | "id"
  | "name"
  | "price"
  | "description"
  | "condition"
  | "category"
  | "thumbnailImageId"
  | "imageIds"
  | "likedCount"
  | "viewedCount"
  | "status"
  | "createdAt"
  | "updateAt"
> & {
  seller: Pick<type.User, "id" | "displayName" | "imageId">;
};

const productReturnLowCostFromDatabaseLow = ({
  id,
  data,
}: {
  id: string;
  data: databaseLow.ProductData;
}): ProductReturnLowCost => ({
  id: id,
  name: data.name,
  price: data.price,
  description: data.description,
  condition: data.condition,
  category: data.category,
  thumbnailImageId: data.thumbnailImageId,
  imageIds: data.imageIds,
  likedCount: data.likedCount,
  viewedCount: data.viewedCount,
  status: data.status,
  createdAt: databaseLow.timestampToDate(data.createdAt),
  updateAt: databaseLow.timestampToDate(data.updateAt),
  seller: {
    id: data.sellerId,
    displayName: data.sellerDisplayName,
    imageId: data.sellerImageId,
  },
});

export const getAllProducts = async (): Promise<Array<ProductReturnLowCost>> =>
  (await databaseLow.getAllProductData()).map(
    productReturnLowCostFromDatabaseLow
  );

export const getRecentProducts = async (): Promise<
  Array<ProductReturnLowCost>
> =>
  (await databaseLow.getRecentProductData()).map(
    productReturnLowCostFromDatabaseLow
  );

export const getRecommendProducts = async (): Promise<
  Array<ProductReturnLowCost>
> =>
  (await databaseLow.getRecommendProductData()).map(
    productReturnLowCostFromDatabaseLow
  );

export const getFreeProducts = async (): Promise<Array<ProductReturnLowCost>> =>
  (await databaseLow.getFreeProductData()).map(
    productReturnLowCostFromDatabaseLow
  );

/**
 * 商品のデータを取得する
 * @param id
 */
export const getProduct = async (id: string): Promise<ProductReturnLowCost> =>
  productReturnLowCostFromDatabaseLow({
    id: id,
    data: await databaseLow.getProduct(id),
  });

export type SearchCondition = {
  query: string;
  category: CategoryCondition | null;
  university: UniversityCondition | null;
};

export type CategoryCondition =
  | {
      c: "category";
      v: type.Category;
    }
  | {
      c: "group";
      v: type.CategoryGroup;
    };

export type UniversityCondition =
  | {
      c: "department";
      v: type.Department;
    }
  | {
      c: "school";
      v: type.School;
    }
  | {
      c: "graduate";
      v: type.Graduate;
    };

export const productSearch = async (
  condition: SearchCondition
): Promise<Array<ProductReturnLowCost>> => {
  const productDataList = await getProductListFromUniversity(
    condition.university
  );
  const productsFilteredCategory =
    condition.category !== null
      ? filterProductsByCategoryCondition(condition.category, productDataList)
      : productDataList;

  return productsFilteredCategory.filter(
    (product) =>
      normalization(product.name).includes(normalization(condition.query)) ||
      normalization(product.description).includes(
        normalization(condition.query)
      )
  );
};

const getProductListFromUniversity = async (
  universityCondition: UniversityCondition | null
): Promise<Array<ProductReturnLowCost>> => {
  if (universityCondition === null) {
    return (await databaseLow.getAllProductData()).map(
      productReturnLowCostFromDatabaseLow
    );
  }
  const productList: Array<ProductReturnLowCost> = [];
  const userList = await getUserListFromUniversityCondition(
    universityCondition
  );
  for (const user of userList) {
    for (const product of user.soldProductAll) {
      productList.push(
        productReturnLowCostFromDatabaseLow({
          id: product.id,
          data: await databaseLow.getProduct(product.id),
        })
      );
    }
  }
  return productList;
};

const getUserListFromUniversityCondition = async (
  universityCondition: UniversityCondition
): Promise<Array<UserReturnLowConst>> => {
  const allUser = await Promise.all(
    (await databaseLow.getAllUserData()).map(async (rec) =>
      databaseLowUserDataToUserDataLowCost({
        id: rec.id,
        data: rec.data,
        privateData: await databaseLow.getUserPrivateData(rec.id),
      })
    )
  );
  switch (universityCondition.c) {
    case "department": {
      return allUser.filter((e): boolean => {
        switch (e.university.c) {
          case type.UniversityC.NotGraduate:
          case type.UniversityC.GraduateTsukuba:
            return e.university.schoolAndDepartment === universityCondition.v;
          case type.UniversityC.GraduateNotTsukuba:
            return false;
        }
      });
    }
    case "school": {
      const departmentList = type.departmentListFromSchool(
        universityCondition.v
      );
      return allUser.filter((u): boolean => {
        switch (u.university.c) {
          case type.UniversityC.NotGraduate:
          case type.UniversityC.GraduateTsukuba:
            return departmentList.includes(u.university.schoolAndDepartment);
          case type.UniversityC.GraduateNotTsukuba:
            return false;
        }
      });
    }
    case "graduate":
      return allUser.filter((u): boolean => {
        switch (u.university.c) {
          case type.UniversityC.NotGraduate:
            return false;
          case type.UniversityC.GraduateTsukuba:
          case type.UniversityC.GraduateNotTsukuba:
            return u.university.graduate === universityCondition.v;
        }
      });
  }
};

const filterProductsByCategoryCondition = (
  condition: CategoryCondition,
  products: Array<ProductReturnLowCost>
): Array<ProductReturnLowCost> => {
  switch (condition.c) {
    case "category":
      return products.filter((product) => product.category === condition.v);
    case "group":
      const categoryList = type.categoryListFromGroup(condition.v);
      return products.filter((product) =>
        categoryList.includes(product.category)
      );
  }
};

/**
 * 検索用に正規化する。カタカナをひらがなに、アルファベットの大文字を小文字に
 * @param text
 */
const normalization = (text: string): string =>
  text
    .replace(/[ァ-ン]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60))
    .toLowerCase();
/**
 * 商品を出品する
 */
export const sellProduct = async (
  userId: string,
  data: Pick<
    type.Product,
    "name" | "price" | "description" | "condition" | "category"
  > & { images: Array<type.DataURL> }
): Promise<
  Pick<
    type.Product,
    | "id"
    | "name"
    | "price"
    | "description"
    | "condition"
    | "category"
    | "thumbnailImageId"
    | "imageIds"
    | "createdAt"
    | "updateAt"
  >
> => {
  const userData = await databaseLow.getUserData(userId);

  const thumbnailImageId = await databaseLow.saveThumbnailImageToCloudStorage(
    data.images[0].data,
    data.images[0].mimeType
  );
  const imagesIds = await Promise.all(
    data.images.map(({ data, mimeType }) =>
      databaseLow.saveFileToCloudStorage(data, mimeType)
    )
  );
  const nowTimestamp = databaseLow.getNowTimestamp();
  const productId = await databaseLow.addProductData({
    name: data.name,
    price: data.price,
    description: data.description,
    condition: data.condition,
    category: data.category,
    thumbnailImageId: thumbnailImageId,
    imageIds: imagesIds,
    likedCount: 0,
    viewedCount: 0,
    status: "selling",
    sellerId: userId,
    sellerDisplayName: userData.displayName,
    sellerImageId: userData.imageId,
    createdAt: nowTimestamp,
    updateAt: nowTimestamp,
  });
  await databaseLow.updateUserData(userId, {
    soldProducts: userData.soldProducts.concat(productId),
  });
  return {
    id: productId,
    name: data.name,
    price: data.price,
    description: data.description,
    condition: data.condition,
    category: data.category,
    thumbnailImageId: thumbnailImageId,
    imageIds: imagesIds,
    createdAt: databaseLow.timestampToDate(nowTimestamp),
    updateAt: databaseLow.timestampToDate(nowTimestamp),
  };
};

export const getProductComments = async (
  productId: string
): Promise<
  Array<
    Pick<type.ProductComment, "body" | "commentId" | "createdAt"> & {
      speaker: Pick<type.User, "id" | "displayName" | "imageId">;
    }
  >
> =>
  (await databaseLow.getProductComments(productId)).map(({ id, data }) => ({
    commentId: id,
    body: data.body,
    createdAt: databaseLow.timestampToDate(data.createdAt),
    speaker: {
      id: data.speakerId,
      displayName: data.speakerDisplayName,
      imageId: data.speakerImageId,
    },
  }));

export const createProductComment = async (
  userId: string,
  productId: string,
  data: Pick<type.ProductComment, "body">
): Promise<
  Array<
    Pick<type.ProductComment, "body" | "commentId" | "createdAt"> & {
      speaker: Pick<type.User, "id" | "displayName" | "imageId">;
    }
  >
> => {
  const userData = await databaseLow.getUserData(userId);
  const nowTimestamp = databaseLow.getNowTimestamp();
  await databaseLow.addProductComment(productId, {
    body: data.body,
    createdAt: nowTimestamp,
    speakerId: userData.displayName,
    speakerDisplayName: userData.displayName,
    speakerImageId: userData.imageId,
  });
  await databaseLow.updateProductData(productId, { updateAt: nowTimestamp });
  return (await databaseLow.getProductComments(productId)).map(
    ({ id, data }) => ({
      commentId: id,
      body: data.body,
      createdAt: databaseLow.timestampToDate(data.createdAt),
      speaker: {
        id: data.speakerId,
        displayName: data.speakerDisplayName,
        imageId: data.speakerImageId,
      },
    })
  );
};

export const likeProduct = async (
  userId: string,
  productId: string
): Promise<void> => {
  const userPrivateData = await databaseLow.getUserPrivateData(userId);
  if (userPrivateData.likedProduct.includes(productId)) {
    return;
  }
  await databaseLow.updateProductData(productId, {
    likedCount: firestore.FieldValue.increment(1),
  });
  await databaseLow.addLikedProductData(userId, productId, {
    createdAt: databaseLow.getNowTimestamp(),
  });
  return;
};

export const unlikeProduct = async (
  userId: string,
  productId: string
): Promise<void> => {
  const userPrivateData = await databaseLow.getUserPrivateData(userId);
  if (!userPrivateData.likedProduct.includes(productId)) {
    return;
  }
  await databaseLow.updateProductData(productId, {
    likedCount: firestore.FieldValue.increment(-1),
  });
  await databaseLow.deleteLikedProductData(userId, productId);
};

/* ==========================================
                    Trade
   ==========================================
*/
type TradeLowCost = Pick<
  type.Trade,
  "id" | "createdAt" | "updateAt" | "status"
> & {
  product: { id: string };
  buyer: { id: string };
};

export const getTrade = async (id: string): Promise<TradeLowCost> => {
  const data = await databaseLow.getTradeData(id);
  return {
    id: id,
    product: {
      id: data.productId,
    },
    buyer: {
      id: data.buyerUserId,
    },
    createdAt: databaseLow.timestampToDate(data.createdAt),
    updateAt: databaseLow.timestampToDate(data.updateAt),
    status: data.status,
  };
};

export const getTradeComments = async (
  id: string
): Promise<Array<type.TradeComment>> =>
  (await databaseLow.getTradeComments(id)).map(({ id, data }) => ({
    commentId: id,
    body: data.body,
    speaker: data.speaker,
    createdAt: databaseLow.timestampToDate(data.createdAt),
  }));

const tradeReturnLowCostFromDatabaseLow = ({
  id,
  data,
}: {
  id: string;
  data: databaseLow.Trade;
}): TradeLowCost => {
  return {
    id: id,
    product: {
      id: data.productId,
    },
    buyer: {
      id: data.buyerUserId,
    },
    createdAt: databaseLow.timestampToDate(data.createdAt),
    updateAt: databaseLow.timestampToDate(data.updateAt),
    status: data.status,
  };
};

export const addTradeComment = async (
  userId: string,
  tradeId: string,
  body: string
): Promise<TradeLowCost> => {
  const nowTime = databaseLow.getNowTimestamp();
  const tradeData = await databaseLow.getTradeData(tradeId);
  const productData = await databaseLow.getProduct(tradeData.productId);
  if (tradeData.buyerUserId === userId) {
    await databaseLow.addTradeComment(tradeId, {
      body: body,
      createdAt: nowTime,
      speaker: "buyer",
    });
    await databaseLow.updateTradeData(tradeId, {
      updateAt: nowTime,
    });
    const notifyAccessToken = (
      await databaseLow.getUserPrivateData(productData.sellerId)
    ).notifyToken;
    const buyerName = (await databaseLow.getUserData(tradeData.buyerUserId))
      .displayName;
    if (notifyAccessToken !== null) {
      await lineNotify.sendMessage(
        `${buyerName}さんが${productData.name}の取引にコメントをつけました。\n\n${body}\n\nhttps://tsukumart.com/trade/${tradeId}`,
        false,
        notifyAccessToken
      );
    }
    return tradeReturnLowCostFromDatabaseLow({
      id: tradeId,
      data: tradeData,
    });
  }

  if (productData.sellerId === userId) {
    await databaseLow.addTradeComment(tradeId, {
      body: body,
      createdAt: nowTime,
      speaker: "seller",
    });
    await databaseLow.updateTradeData(tradeId, {
      updateAt: nowTime,
    });
    const notifyAccessToken = (
      await databaseLow.getUserPrivateData(tradeData.buyerUserId)
    ).notifyToken;
    if (notifyAccessToken !== null) {
      await lineNotify.sendMessage(
        `${productData.sellerDisplayName}さんが${productData.name}の取引にコメントをつけました。\n\n${body}\n\nhttps://tsukumart.com/trade/${tradeId}`,
        false,
        notifyAccessToken
      );
    }

    return tradeReturnLowCostFromDatabaseLow({
      id: tradeId,
      data: tradeData,
    });
  }
  throw new Error("取引に出品者でも、購入者でもない人がコメントしようとした");
};

export const startTrade = async (
  buyerUserId: string,
  productId: string
): Promise<TradeLowCost> => {
  const nowTime = databaseLow.getNowTimestamp();
  const tradeId = await databaseLow.startTrade({
    buyerUserId: buyerUserId,
    productId: productId,
    status: "inProgress",
    createdAt: nowTime,
    updateAt: nowTime,
  });
  await databaseLow.updateUserPrivateData(buyerUserId, {
    trading: (
      await databaseLow.getUserPrivateData(buyerUserId)
    ).trading.concat([tradeId]),
  });
  const product = await databaseLow.getProduct(productId);
  await databaseLow.updateUserPrivateData(product.sellerId, {
    trading: (
      await databaseLow.getUserPrivateData(product.sellerId)
    ).trading.concat([tradeId]),
  });
  await databaseLow.updateProductData(productId, {
    status: "trading",
  });

  const seller = await databaseLow.getUserPrivateData(product.sellerId);
  const buyer = await databaseLow.getUserData(buyerUserId);
  if (seller.notifyToken !== null) {
    await lineNotify.sendMessage(
      `${buyer.displayName}さんが${product.name}の取引を開始しました。\n\nhttps://tsukumart.com/trade/${tradeId}`,
      true,
      seller.notifyToken
    );
  }
  return {
    id: tradeId,
    buyer: {
      id: buyerUserId,
    },
    product: {
      id: productId,
    },
    status: "inProgress",
    createdAt: databaseLow.timestampToDate(nowTime),
    updateAt: databaseLow.timestampToDate(nowTime),
  };
};

export const cancelTrade = async (
  userId: string,
  tradeId: string
): Promise<TradeLowCost> => {
  const nowTime = databaseLow.getNowTimestamp();
  const tradeData = await databaseLow.getTradeData(tradeId);
  let status: type.TradeStatus | undefined = undefined;
  const productData = await databaseLow.getProduct(tradeData.productId);
  const sellerPrivate = await databaseLow.getUserPrivateData(
    productData.sellerId
  );
  const seller = await databaseLow.getUserData(productData.sellerId);
  const buyerPrivate = await databaseLow.getUserPrivateData(
    tradeData.buyerUserId
  );
  const buyer = await databaseLow.getUserData(tradeData.buyerUserId);
  if (tradeData.buyerUserId === userId) {
    if (sellerPrivate.notifyToken !== null) {
      await lineNotify.sendMessage(
        `${buyer.displayName}さんが${productData.name}の取引をキャンセルしました。\n\nhttps://tsukumart.com/trade/${tradeId}`,
        true,
        sellerPrivate.notifyToken
      );
    }
    status = "cancelByBuyer";
  }
  if (productData.sellerId === userId) {
    if (buyerPrivate.notifyToken !== null) {
      await lineNotify.sendMessage(
        `${seller.displayName}さんが${productData.name}の取引をキャンセルしました。\n\nhttps://tsukumart.com/trade/${tradeId}`,
        true,
        buyerPrivate.notifyToken
      );
    }
    status = "cancelBySeller";
  }
  if (status === undefined) {
    throw new Error(
      "取引に出品者でも、購入者でもない人が取引をキャンセルしようとした"
    );
  }
  await databaseLow.updateTradeData(tradeId, {
    updateAt: nowTime,
    status: status,
  });
  const buyerData = await databaseLow.getUserPrivateData(tradeData.buyerUserId);
  await databaseLow.updateUserPrivateData(tradeData.buyerUserId, {
    trading: buyerData.trading.filter((e) => e !== tradeId),
    traded: buyerData.traded.concat([tradeId]),
  });
  const sellerData = await await databaseLow.getUserPrivateData(
    productData.sellerId
  );
  await databaseLow.updateUserPrivateData(productData.sellerId, {
    trading: sellerData.trading.filter((e) => e !== tradeId),
    traded: sellerData.traded.concat([tradeId]),
  });
  await databaseLow.updateProductData(tradeData.productId, {
    status: "selling",
  });
  return tradeReturnLowCostFromDatabaseLow({
    id: tradeId,
    data: { ...tradeData, updateAt: nowTime, status: status },
  });
};

export const finishTrade = async (userId: string, tradeId: string) => {
  const nowTime = databaseLow.getNowTimestamp();
  const tradeData = await databaseLow.getTradeData(tradeId);
  const productData = await databaseLow.getProduct(tradeData.productId);
  if (productData.sellerId === userId) {
    if (tradeData.status === "inProgress") {
      await databaseLow.updateTradeData(tradeId, {
        updateAt: nowTime,
        status: "waitBuyerFinish",
      });
      return tradeReturnLowCostFromDatabaseLow({
        id: tradeId,
        data: {
          ...tradeData,
          updateAt: nowTime,
          status: "waitBuyerFinish",
        },
      });
    }
    if (tradeData.status === "waitSellerFinish") {
      await databaseLow.updateTradeData(tradeId, {
        updateAt: nowTime,
        status: "finish",
      });
      const buyerData = await databaseLow.getUserPrivateData(
        tradeData.buyerUserId
      );
      await databaseLow.updateUserPrivateData(tradeData.buyerUserId, {
        trading: buyerData.trading.filter((e) => e !== tradeId),
        traded: buyerData.traded.concat([tradeId]),
      });
      const sellerData = await databaseLow.getUserPrivateData(
        productData.sellerId
      );
      await databaseLow.updateUserPrivateData(productData.sellerId, {
        trading: sellerData.trading.filter((e) => e !== tradeId),
        traded: sellerData.traded.concat([tradeId]),
      });
      await databaseLow.updateProductData(tradeData.productId, {
        status: "soldOut",
      });
      return tradeReturnLowCostFromDatabaseLow({
        id: tradeId,
        data: { ...tradeData, updateAt: nowTime, status: "finish" },
      });
    }
    return tradeReturnLowCostFromDatabaseLow({
      id: tradeId,
      data: tradeData,
    });
  }
  if (tradeData.buyerUserId === userId) {
    if (tradeData.status === "inProgress") {
      await databaseLow.updateTradeData(tradeId, {
        updateAt: nowTime,
        status: "waitSellerFinish",
      });
      return tradeReturnLowCostFromDatabaseLow({
        id: tradeId,
        data: {
          ...tradeData,
          updateAt: nowTime,
          status: "waitSellerFinish",
        },
      });
    }
    if (tradeData.status === "waitBuyerFinish") {
      await databaseLow.updateTradeData(tradeId, {
        updateAt: nowTime,
        status: "finish",
      });
      const buyerData = await databaseLow.getUserPrivateData(
        tradeData.buyerUserId
      );
      await databaseLow.updateUserPrivateData(tradeData.buyerUserId, {
        trading: buyerData.trading.filter((e) => e !== tradeId),
        traded: buyerData.traded.concat([tradeId]),
      });
      const sellerData = await databaseLow.getUserPrivateData(
        productData.sellerId
      );
      await databaseLow.updateUserPrivateData(productData.sellerId, {
        trading: sellerData.trading.filter((e) => e !== tradeId),
        traded: sellerData.traded.concat([tradeId]),
      });
      await databaseLow.updateProductData(tradeData.productId, {
        status: "soldOut",
      });
      return tradeReturnLowCostFromDatabaseLow({
        id: tradeId,
        data: { ...tradeData, updateAt: nowTime, status: "finish" },
      });
    }
    return tradeReturnLowCostFromDatabaseLow({
      id: tradeId,
      data: tradeData,
    });
  }
  throw new Error("購入者じゃない人が、取引を完了させようとした");
};

export const saveNotifyToken = async (
  userId: string,
  token: string
): Promise<void> => {
  return await databaseLow.updateUserPrivateData(userId, {
    notifyToken: token,
  });
};

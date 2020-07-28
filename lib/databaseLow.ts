import * as type from "./type";
import * as firestore from "@google-cloud/firestore";
import * as admin from "firebase-admin";
import * as sharp from "sharp";
import * as stream from "stream";

const initializedAdmin = admin.initializeApp();
const dataBase = initializedAdmin.firestore();
const storage = initializedAdmin.storage().bucket();

const userCollectionRef = dataBase.collection("user");
const userPrivateCollectionRef = dataBase.collection("userPrivate");
const userBeforeInputDataCollection = dataBase.collection(
  "userBeforeInputData"
);
const userBeforeEmailVerificationCollection = dataBase.collection(
  "userBeforeEmailVerification"
);
const lineLogInStateCollection = dataBase.collection("lineState");
const lineNotifyStateCollection = dataBase.collection("lineNotifyState");
const productCollectionRef = dataBase.collection("product");
const productDeletedCollectionRef = dataBase.collection("productDeleted");
const tradeCollectionRef = dataBase.collection("trade");
/* ==========================================
                    User
   ==========================================
*/
export type UserData = {
  displayName: string;
  imageId: string;
  schoolAndDepartment: type.Department | null;
  graduate: type.Graduate | null;
  introduction: string;
  createdAt: firestore.Timestamp;
  soldProducts: Array<string>;
};
/**
 * ユーザーのデータを取得する
 * @param id
 * @throws {Error} userId ${id} dose not exists
 */
export const getUserData = async (id: string): Promise<UserData> => {
  const userData = (await userCollectionRef.doc(id).get()).data();
  if (userData === undefined) {
    throw new Error(`userId ${id} dose not exists`);
  }
  return userData as UserData;
};
/**
 * ユーザーの個人的なデータを取得する
 * @param id
 * @param userData
 */
export const getUserPrivateData = async (
  id: string
): Promise<UserPrivateData> => {
  const data = (await userPrivateCollectionRef.doc(id).get()).data();
  if (data === undefined) {
    throw new Error(`userId ${id} dose not exists`);
  }
  return data as UserPrivateData;
};
/**
 * ユーザーのデータを上書きする。すでにあるフィールドはそのまま残る
 * @param id
 * @param userData
 */
export const updateUserData = async (
  id: string,
  userData: Partial<UserData>
): Promise<void> => {
  await userCollectionRef.doc(id).update(userData);
};

export const updateUserPrivateData = async (
  id: string,
  userData: Partial<UserPrivateData>
): Promise<void> => {
  await userPrivateCollectionRef.doc(id).update(userData);
};

/**
 * ユーザーの商品の閲覧記録に商品を登録する。
 * @param userId
 * @param productId
 */
export const addHistoryViewProductData = async (
  userId: string,
  productId: string
): Promise<void> => {
  await userPrivateCollectionRef.doc(userId).update({
    historyViewProduct: firestore.FieldValue.arrayUnion(productId),
  });
};

type LikedProductData = {
  createdAt: firestore.Timestamp;
};

export const addLikedProductData = async (
  userId: string,
  productId: string,
  data: LikedProductData
): Promise<void> => {
  await userPrivateCollectionRef
    .doc(userId)
    .update({ likedProduct: firestore.FieldValue.arrayUnion(productId) });
};

export const deleteLikedProductData = async (
  userId: string,
  productId: string
): Promise<void> => {
  await userPrivateCollectionRef
    .doc(userId)
    .update({ likedProduct: firestore.FieldValue.arrayRemove(productId) });
};

export const addCommentedProductData = async (
  userId: string,
  productId: string
): Promise<void> => {
  await userPrivateCollectionRef.doc(userId).update({
    commentedProduct: firestore.FieldValue.arrayUnion(productId),
  });
};

type DraftProductData = {
  name: string;
  description: string;
  price: number | null;
  condition: type.Condition | null;
  category: type.Category | null;
  thumbnailImageId: string;
  imageIds: Array<string>;
  createdAt: firestore.Timestamp;
  updateAt: firestore.Timestamp;
};

/**
 * 商品の下書きのデータをユーザーに追加する
 * @param userId
 * @param data
 */
export const addDraftProductData = async (
  userId: string,
  data: DraftProductData
): Promise<string> =>
  (await userCollectionRef.doc(userId).collection("draftProduct").add(data)).id;

/**
 * 商品の下書きのデータをユーザーから最後に更新した順に取得する
 * @param userId
 */
export const getAllDraftProductData = async (
  userId: string
): Promise<Array<{ id: string; data: DraftProductData }>> =>
  (await querySnapshotToIdAndDataArray(
    await userCollectionRef
      .doc(userId)
      .collection("draftProduct")
      .orderBy("updateAt")
      .get()
  )) as Array<{ id: string; data: DraftProductData }>;

export const getDraftProductData = async (
  userId: string,
  draftId: string
): Promise<DraftProductData> => {
  const data = (
    await await userCollectionRef
      .doc(userId)
      .collection("draftProduct")
      .doc(draftId)
      .get()
  ).data();
  if (data === undefined) {
    throw new Error(`trade id=${draftId} at userId=${userId} dose not exists`);
  }
  return data as DraftProductData;
};

export const updateDraftProduct = async (
  userId: string,
  draftId: string,
  data: Partial<DraftProductData>
): Promise<void> => {
  await userCollectionRef
    .doc(userId)
    .collection("draftProduct")
    .doc(draftId)
    .update(data);
};

export const deleteDraftProduct = async (
  userId: string,
  draftId: string
): Promise<void> => {
  await userCollectionRef
    .doc(userId)
    .collection("draftProduct")
    .doc(draftId)
    .delete();
};
/**
 * ユーザーの追加(公開するデータ)
 * @param userData
 */
export const addUserData = async (data: UserData): Promise<string> => {
  const id = createRandomFileId();
  await userCollectionRef.doc(id).set(data);
  return id;
};
/**
 * ユーザーの追加(個人的なデータ)
 */
export const addUserPrivateData = async (
  id: string,
  data: UserPrivateData
): Promise<void> => {
  await userPrivateCollectionRef.doc(id).set(data);
};

/**
 * すべてのユーザーのデータを取得する
 */
export const getAllUserData = async (): Promise<
  Array<{
    id: string;
    data: UserData;
  }>
> => {
  return (await querySnapshotToIdAndDataArray(
    await userCollectionRef.get()
  )) as Array<{
    id: string;
    data: UserData;
  }>;
};

export const getUserByLogInServiceAndId = async (
  logInServiceAndId: type.LogInServiceAndId
): Promise<{ id: string } | null> => {
  const queryDocumentSnapshot = await getUserPrivateListFromCondition(
    "logInAccountServiceId",
    "==",
    type.logInServiceAndIdToString(logInServiceAndId)
  );
  if (0 < queryDocumentSnapshot.length) {
    const snapshot = queryDocumentSnapshot[0];
    return { id: snapshot.id };
  }
  return null;
};

export const updateRandomState = async (
  lastAccessTokenId: string,
  userId: string
): Promise<void> => {
  await userPrivateCollectionRef
    .doc(userId)
    .set({ lastAccessTokenId }, { merge: true });
};
/**
 * ユーザーの条件を指定して検索する
 * @param fieldName field
 * @param operator
 * @param value
 */
const getUserListFromCondition = async <Field extends keyof UserData>(
  fieldName: Field,
  operator: firestore.WhereFilterOp,
  value: UserData[Field]
): Promise<firestore.QueryDocumentSnapshot[]> =>
  (await userCollectionRef.where(fieldName, operator, value).get()).docs;

const getUserPrivateListFromCondition = async <
  Field extends keyof UserPrivateData
>(
  fieldName: Field,
  operator: firestore.WhereFilterOp,
  value: UserPrivateData[Field]
): Promise<firestore.QueryDocumentSnapshot[]> =>
  (await userPrivateCollectionRef.where(fieldName, operator, value).get()).docs;

export const deleteUser = async () => {
  //サブコレクションを手動で削除しなければならない。履歴、下書きなど
};
/* ==========================================
            User Before Input Data
   ==========================================
*/
type UserBeforeInputDataData = {
  name: string;
  imageId: string;
  createdAt: firestore.Timestamp;
};

export const addUserBeforeInputData = async (
  logInServiceAndId: type.LogInServiceAndId,
  data: UserBeforeInputDataData
): Promise<void> => {
  await userBeforeInputDataCollection
    .doc(type.logInServiceAndIdToString(logInServiceAndId))
    .set(data);
};

export const getAndDeleteUserBeforeInputData = async (
  logInAccountServiceId: type.LogInServiceAndId
): Promise<UserBeforeInputDataData> => {
  const docRef = await userBeforeInputDataCollection.doc(
    type.logInServiceAndIdToString(logInAccountServiceId)
  );
  const doc = await docRef.get();
  const userBeforeInputData = doc.data();
  if (userBeforeInputData === undefined) {
    console.log("存在しない情報入力前のユーザーを指定された");
    throw new Error("存在しない情報入力前のユーザーを指定された");
  }
  await docRef.delete();
  return userBeforeInputData as UserBeforeInputDataData;
};
/* ==========================================
         User Before Email Verification
   ==========================================
*/
type UserBeforeEmailVerificationData = {
  firebaseAuthUserId: string;
  name: string;
  imageId: string;
  schoolAndDepartment: type.Department | null;
  graduate: type.Graduate | null;
  email: string;
  createdAt: firestore.Timestamp;
};

export const addUserBeforeEmailVerification = async (
  logInAccountServiceId: type.LogInServiceAndId,
  data: UserBeforeEmailVerificationData
): Promise<void> => {
  await userBeforeEmailVerificationCollection
    .doc(type.logInServiceAndIdToString(logInAccountServiceId))
    .set(data);
};

export const getUserBeforeEmailVerification = async (
  logInAccountServiceId: type.LogInServiceAndId
): Promise<UserBeforeEmailVerificationData | undefined> =>
  (
    await userBeforeEmailVerificationCollection
      .doc(type.logInServiceAndIdToString(logInAccountServiceId))
      .get()
  ).data() as UserBeforeEmailVerificationData | undefined;

export const deleteUserBeforeEmailVerification = async (
  logInAccountServiceId: type.LogInServiceAndId
): Promise<void> => {
  await userBeforeEmailVerificationCollection
    .doc(type.logInServiceAndIdToString(logInAccountServiceId))
    .delete();
};
/* ==========================================
                    Product
   ==========================================
*/
export type ProductData = {
  name: string;
  price: number;
  description: string;
  condition: type.Condition;
  category: type.Category;
  thumbnailImageId: string;
  imageIds: Array<string>;
  likedCount: number;
  viewedCount: number;
  status: type.ProductStatus;
  sellerId: string;
  sellerDisplayName: string;
  sellerImageId: string;
  createdAt: firestore.Timestamp;
  updateAt: firestore.Timestamp;
};

/**
 * 指定したIDの商品があるかどうか調べる
 * @param id
 */
export const existsProduct = async (id: string): Promise<boolean> =>
  (await productCollectionRef.doc(id).get()).exists;

/**
 * 商品のデータを取得する
 * @param id
 * @throws {Error} productId ${id} dose not exists
 */
export const getProduct = async (id: string): Promise<ProductData> => {
  const data = (await productCollectionRef.doc(id).get()).data();
  if (data === undefined) {
    throw new Error(`productId ${id} dose not exists`);
  }
  return data as ProductData;
};

/**
 * 商品のデータを上書きする
 * @param id
 * @param data
 */
export const updateProductData = async (
  id: string,
  data: {
    [P in keyof ProductData]?: ProductData[P] | firestore.FieldValue;
  }
): Promise<void> => {
  await productCollectionRef.doc(id).update(data);
};

/**
 * 商品のデータを追加する
 * @param userData
 */
export const addProductData = async (data: ProductData): Promise<string> => {
  const id = createRandomFileId();
  await productCollectionRef.doc(id).set(data);
  return id;
};

/**
 * すべての商品のデータを取得する
 */
export const getAllProductData = async (): Promise<
  Array<{
    id: string;
    data: ProductData;
  }>
> =>
  (await querySnapshotToIdAndDataArray(
    await productCollectionRef.get()
  )) as Array<{
    id: string;
    data: ProductData;
  }>;

/**
 *  商品を新着順で取得する
 */
export const getRecentProductData = async (): Promise<
  Array<{
    id: string;
    data: ProductData;
  }>
> =>
  (await querySnapshotToIdAndDataArray(
    await getProductsOrderBy("createdAt", "desc")
  )) as Array<{
    id: string;
    data: ProductData;
  }>;

/**
 * 商品をいいねが多い順に取得する
 */
export const getRecommendProductData = async (): Promise<
  Array<{
    id: string;
    data: ProductData;
  }>
> =>
  (await querySnapshotToIdAndDataArray(
    await getProductsOrderBy("likedCount", "desc")
  )) as Array<{ id: string; data: ProductData }>;

/**
 * 0円の商品を取得する
 */
export const getFreeProductData = async (): Promise<
  Array<{
    id: string;
    data: ProductData;
  }>
> =>
  (await querySnapshotToIdAndDataArray(
    await getProductsCondition("price", "==", 0)
  )) as Array<{ id: string; data: ProductData }>;
/**
 * 商品の条件を指定して、指定した順番で取得する。複合クエリの指定が事前に必要
 * @param fieldName
 * @param operator
 * @param value
 */
const getProductsConditionOrderBy = async <
  WhereField extends keyof ProductData,
  OrderByField extends keyof ProductData
>(
  fieldName: WhereField,
  operator: firestore.WhereFilterOp,
  value: ProductData[WhereField],
  orderByField: OrderByField,
  directionStr: firestore.OrderByDirection
): Promise<firestore.QuerySnapshot> =>
  await productCollectionRef
    .where(fieldName, operator, value)
    .orderBy(orderByField, directionStr)
    .get();

/**
 * 商品の条件を指定して取得する
 * @param fieldName
 * @param operator
 * @param value
 */
const getProductsCondition = async <WhereField extends keyof ProductData>(
  fieldName: WhereField,
  operator: firestore.WhereFilterOp,
  value: ProductData[WhereField]
): Promise<firestore.QuerySnapshot> =>
  await productCollectionRef.where(fieldName, operator, value).get();

/**
 * すべての商品を指定した順番で取得する
 */
const getProductsOrderBy = async <Field extends keyof ProductData>(
  field: Field,
  directionStr: firestore.OrderByDirection
): Promise<firestore.QuerySnapshot> =>
  await productCollectionRef.orderBy(field, directionStr).get();

type ProductComment = {
  body: string;
  speakerId: string;
  speakerDisplayName: string;
  speakerImageId: string;
  createdAt: firestore.Timestamp;
};

const productCommentCollectionName = "comment";

export const addProductComment = async (
  id: string,
  data: ProductComment
): Promise<void> => {
  await productCollectionRef
    .doc(id)
    .collection(productCommentCollectionName)
    .add(data);
};

export const getProductComments = async (
  id: string
): Promise<Array<{ id: string; data: ProductComment }>> =>
  (await querySnapshotToIdAndDataArray(
    await productCollectionRef
      .doc(id)
      .collection(productCommentCollectionName)
      .orderBy("createdAt")
      .get()
  )) as Array<{ id: string; data: ProductComment }>;

export const deleteProduct = async (id: string): Promise<void> => {
  await productCollectionRef.doc(id).delete();
};

export const addDeletedProduct = async (
  data: ProductData & { deletedAt: firestore.Timestamp }
): Promise<void> => {
  await productDeletedCollectionRef.add(data);
};
/* ==========================================
                    Trade
   ==========================================
*/
export type Trade = {
  productId: string;
  buyerUserId: string;
  createdAt: firestore.Timestamp;
  updateAt: firestore.Timestamp;
  status: type.TradeStatus;
};

export const getTradeData = async (id: string): Promise<Trade> => {
  const data = (await tradeCollectionRef.doc(id).get()).data();
  if (data === undefined) {
    throw new Error(`trade id=${id} dose not exists`);
  }
  return data as Trade;
};

export const updateTradeData = async (
  id: string,
  data: Partial<Trade>
): Promise<void> => {
  await tradeCollectionRef.doc(id).set(data, { merge: true });
};

export const startTrade = async (data: Trade): Promise<string> => {
  const id = createRandomFileId();
  await tradeCollectionRef.doc(id).set(data);
  return id;
};

type TradeComment = {
  body: string;
  speaker: type.SellerOrBuyer;
  createdAt: firestore.Timestamp;
};

export const addTradeComment = async (
  id: string,
  data: TradeComment
): Promise<string> => {
  return (await tradeCollectionRef.doc(id).collection("comment").add(data)).id;
};

export const getTradeComments = async (
  id: string
): Promise<Array<{ id: string; data: TradeComment }>> =>
  (await querySnapshotToIdAndDataArray(
    await tradeCollectionRef.doc(id).collection("comment").get()
  )) as Array<{ id: string; data: TradeComment }>;
/* ==========================================
   ==========================================
*/

/**
 * クエリの解析結果を配列に変換する
 * @param querySnapshot
 */
const querySnapshotToIdAndDataArray = (
  querySnapshot: FirebaseFirestore.QuerySnapshot
): Array<{ id: string; data: FirebaseFirestore.DocumentData }> =>
  querySnapshot.docs.map((result) => ({ id: result.id, data: result.data() }));
/* ==========================================
                Time Stamp
   ==========================================
*/
export const getNowTimestamp = (): firestore.Timestamp =>
  firestore.Timestamp.now();

export const timestampToDate = (timeStamp: firestore.Timestamp): Date =>
  timeStamp.toDate();
/* ==========================================
        Firebase Authentication 
   ==========================================
*/
/**
 * Firebase Authenticationのユーザーをランダムなパスワードで作成する
 * // メールを送るためだけのアカウント。実際のユーザーは別で管理する
 */
export const createFirebaseAuthUserByRandomPassword = (
  email: string,
  displayName: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    initializedAdmin
      .auth()
      .getUserByEmail(email)
      .then((user) => {
        user.displayName = displayName;
        resolve(user.uid);
      })
      .catch(() => {
        initializedAdmin
          .auth()
          .createUser({
            email: email,
            password: createRandomPassword(),
            displayName: displayName,
          })
          .then((user) => {
            resolve(user.uid);
          });
      });
  });

const createRandomPassword = (): string => {
  let id = "";
  const charTable: string =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 32; i++) {
    id += charTable[Math.floor(Math.random() * charTable.length)];
  }
  return id;
};

export const getFirebaseAuthUserEmailVerified = async (
  id: string
): Promise<boolean> =>
  (await initializedAdmin.auth().getUser(id)).emailVerified;
/* ==========================================
            Firebase Client Auth 
   ==========================================
*/
export const createCustomToken = async (uid: string): Promise<string> =>
  await initializedAdmin.auth().createCustomToken(uid);
/* ==========================================
            Firebase Cloud Storage
   ==========================================
*/
/**
 * Firebase Cloud Storageで新しくファイルを作成する
 */
export const saveFileToCloudStorage = async (
  data: ArrayBuffer,
  mimeType: string
): Promise<string> => {
  const id = createRandomFileId();
  const file = storage.file(id);
  await file.save(data, { contentType: mimeType });
  return id;
};

export const saveThumbnailImageToCloudStorage = async (
  data: Buffer,
  mimeType: string
): Promise<string> => {
  const fileId = createRandomFileId();
  const file = storage.file(fileId);
  file.save(await sharp(data).resize(300, 300, { fit: "inside" }).toBuffer(), {
    contentType: mimeType,
  });
  return fileId;
};

export const saveThumbnailImageFromCloudStorageToCloudStorage = async (
  fileId: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    const thumbnailFileId = createRandomFileId();
    const writeStream = storage.file(thumbnailFileId).createWriteStream();
    const readStream = storage.file(fileId).createReadStream();
    readStream.addListener("end", () => {
      resolve(thumbnailFileId);
    });
    readStream
      .pipe(sharp().resize(300, 300, { fit: "inside" }).jpeg())
      .pipe(writeStream);
  });
/**
 * ランダムなファイル名を生成する
 */
const createRandomFileId = (): string => {
  let id = "";
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  for (let i = 0; i < 22; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
};

/**
 * Firebase Cloud Storageにあるファイルを削除する
 * @param fileId ファイルID
 */
export const deleteStorageFile = async (fileId: string): Promise<void> => {
  await storage.file(fileId).delete();
};

/**
 * Firebase Cloud StorageにあるファイルのReadStreamを得る
 * @param folderName フォルダ名
 * @param fileName ファイル名
 */
export const getImageReadStream = (fileId: string): stream.Readable =>
  storage.file(fileId).createReadStream();

/**
 * LINEへの OpenId ConnectのStateを生成して保存する
 * リプレイアタックを防いだり、他のサーバーがつくマートのクライアントIDを使って発行しても自分が発行したものと見比べて識別できるようにする
 */
export const generateAndWriteLineLogInState = async (): Promise<string> =>
  (await lineLogInStateCollection.add({})).id;

/**
 * LINE Notifyの、CSRF攻撃に対応するためのトークンを生成して保存する
 * リプレイアタックを防いだり、他のサーバーがつくマートのクライアントIDを使って発行しても自分が発行したものと見比べて識別できるようにする
 */
export const generateAndWriteLineNotifyState = async (
  userId: string
): Promise<string> =>
  (await lineNotifyStateCollection.add({ userId: userId })).id;

/**
 * LINEへのstateが存在することを確認し、存在するなら削除する
 */
export const existsLineLogInStateAndDelete = async (
  state: string
): Promise<boolean> => {
  const docRef: FirebaseFirestore.DocumentReference = lineLogInStateCollection.doc(
    state
  );
  const exists = (await docRef.get()).exists;
  if (exists) {
    await docRef.delete();
  }
  return exists;
};

/**
 * LINE Notifyへのstateが存在することを確認し、存在するなら削除する
 */
export const existsLineNotifyStateAndDeleteAndGetUserId = async (
  state: string
): Promise<string | null> => {
  const docRef: FirebaseFirestore.DocumentReference = lineNotifyStateCollection.doc(
    state
  );
  const data = (await docRef.get()).data();
  if (data === undefined) {
    return null;
  }
  await docRef.delete();
  return data.userId;
};

export type UserPrivateData = {
  boughtProduct: Array<string>;
  emailAddress: string;
  lastAccessTokenId: string;
  logInAccountServiceId: string;
  notifyToken: string | null;
  traded: Array<string>;
  trading: Array<string>;
  historyViewProduct: Array<string>;
  commentedProduct: Array<string>;
  likedProduct: Array<string>;
};

export const c = async (): Promise<void> => {};

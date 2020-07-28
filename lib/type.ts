import * as g from "graphql";
import { URL } from "url";

/*  ===================================
 *              URL
 * ====================================
 */
const urlTypeScalarTypeConfig: g.GraphQLScalarTypeConfig<URL, string> = {
  name: "URL",
  description: `URL 文字列で指定する 例"https://narumincho.com/definy/spec.html"`,
  serialize: (url: URL): string => url.toString(),
  parseValue: (value: string): URL => new URL(value),
};

export const urlGraphQLType = new g.GraphQLScalarType(urlTypeScalarTypeConfig);

/** ===================================
 *           Data URL
 * ====================================
 */
export type DataURL = { mimeType: string; data: Buffer };

const dataUrlTypeConfig: g.GraphQLScalarTypeConfig<DataURL, string> = {
  name: "DataURL",
  description:
    "DataURL (https://developer.mozilla.org/ja/docs/Web/HTTP/Basics_of_HTTP/Data_URIs) base64エンコードのみサポート",
  serialize: (value: DataURL): string =>
    "data:" + value.mimeType + ";base64," + value.data.toString(),
  parseValue: (value: string): DataURL => {
    const imageDataUrlMimeType = value.match(/^data:(.+);base64,(.+)$/);
    if (imageDataUrlMimeType === null) {
      throw new Error("invalid DataURL");
    }
    return {
      mimeType: imageDataUrlMimeType[1],
      data: Buffer.from(imageDataUrlMimeType[2], "base64"),
    };
  },
};

export const dataUrlGraphQLType = new g.GraphQLScalarType(dataUrlTypeConfig);
/** ===================================
 *            DateTime
 * ====================================
 */
const dateTimeTypeConfig: g.GraphQLScalarTypeConfig<Date, number> = {
  name: "DateTime",
  description:
    "日付と時刻。1970年1月1日 00:00:00 UTCから指定した日時までの経過時間をミリ秒で表した数値 2038年問題を回避するために64bitFloatの型を使う",
  serialize: (value: Date): number => value.getTime(),
  parseValue: (value: number): Date => new Date(value),
  parseLiteral: (ast) => {
    if (ast.kind === "FloatValue" || ast.kind === "IntValue") {
      try {
        return new Date(Number.parseInt(ast.value));
      } catch {
        return null;
      }
    }
    return null;
  },
};

export const dateTimeGraphQLType = new g.GraphQLScalarType(dateTimeTypeConfig);
/** ===================================
 *           AccountService
 * ====================================
 */
const accountServiceValues = {
  line: {
    description: "LINE https://developers.line.biz/ja/docs/line-login/",
  },
};

export type AccountService = keyof typeof accountServiceValues;

export const accountServiceGraphQLType = new g.GraphQLEnumType({
  name: "AccountService",
  values: accountServiceValues,
  description: "ソーシャルログインを提供するサービス",
});

export const checkAccountServiceValues = (
  string: string
): AccountService | null => {
  switch (string) {
    case "line":
      return string;
  }
  return null;
};
/** ===================================
 *            University
 * ====================================
 */
const schoolValues = {
  humcul: {
    description: "人文・文化学群",
    department: ["humanity", "culture", "japanese"],
  },
  socint: { description: "社会・国際学群", department: ["social", "cis"] },
  human: {
    description: "人間学群",
    department: ["education", "psyche", "disability"],
  },
  life: { description: "生命環境学群" },
  sse: { description: "理工学群" },
  info: { description: "情報学群" },
  med: { description: "医学群" },
  aandd: { description: "芸術専門学群" },
  sport: { description: "体育専門学群" },
};

export type School = keyof typeof schoolValues;

export const schoolGraphQLType = new g.GraphQLEnumType({
  name: "School",
  values: schoolValues,
  description: "学群ID",
});

const departmentValues = {
  humanity: { description: "人文・文化学群 / 人文学類" },
  culture: { description: "人文・文化学群 / 比較文化学類" },
  japanese: {
    description: "人文・文化学群 / 日本語・日本文化学類",
  },
  social: { description: "社会・国際学群 / 社会学類" },
  cis: { description: "社会・国際学群 / 国際総合学類" },
  education: { description: "人間学群 / 教育学類" },
  psyche: { description: "人間学群 / 心理学類" },
  disability: { description: "人間学群 / 障害科学類" },
  biol: { description: "生命環境学群 / 生物学類" },
  bres: { description: "生命環境学群 / 生物資源学類" },
  earth: { description: "生命環境学群 / 地球学類" },
  math: { description: "理工学群 / 数学類" },
  phys: { description: "理工学群 / 物理学類" },
  chem: { description: "理工学群 / 化学類" },
  coens: { description: "理工学群 / 応用理工学類" },
  esys: { description: "理工学群 / 工学システム学類" },
  pandps: { description: "理工学群 / 社会工学類" },
  coins: { description: "情報学群 / 情報科学類" },
  mast: { description: "情報学群 / 情報メディア創成学類" },
  klis: { description: "情報学群 / 知識情報・図書館科学類" },
  med: { description: "医学群 / 医学類" },
  nurse: { description: "医学群 / 看護学類" },
  ms: { description: "医学群 / 医療科学類" },
  aandd: { description: "芸術専門学群" },
  sport: { description: "体育専門学群" },
};

export type Department = keyof typeof departmentValues;

export const departmentGraphQLType = new g.GraphQLEnumType({
  name: "Department",
  values: departmentValues,
  description: "学類ID",
});

export const departmentListFromSchool = (school: School): Array<Department> => {
  switch (school) {
    case "humcul":
      return ["humanity", "culture", "japanese"];
    case "socint":
      return ["social", "cis"];
    case "human":
      return ["education", "psyche", "disability"];
    case "life":
      return ["biol", "bres", "earth"];
    case "sse":
      return ["math", "phys", "chem", "coens", "esys", "pandps"];
    case "info":
      return ["coins", "mast", "klis"];
    case "med":
      return ["med", "nurse", "ms"];
    case "aandd":
      return ["aandd"];
    case "sport":
      return ["sport"];
  }
};

const graduateValues = {
  education: { description: "教育研究科" },
  hass: { description: "人文社会科学研究科" },
  gabs: { description: "ビジネス科学研究科" },
  pas: { description: "数理物質科学研究科" },
  sie: { description: " システム情報工学研究科" },
  life: { description: " 生命環境科学研究科" },
  chs: { description: "人間総合科学研究科" },
  slis: { description: "図書館情報メディア研究科" },
  global: { description: "グローバル研究院" },
};
export type Graduate = keyof typeof graduateValues;

export const graduateGraphQLType = new g.GraphQLEnumType({
  name: "Graduate",
  values: graduateValues,
  description: "研究科ID",
});

export type UniversityInternal = {
  schoolAndDepartment: Department | undefined | null;
  graduate: Graduate | undefined | null;
};

export type University =
  | {
      c: UniversityC.GraduateTsukuba;
      schoolAndDepartment: Department;
      graduate: Graduate;
    }
  | { c: UniversityC.GraduateNotTsukuba; graduate: Graduate }
  | { c: UniversityC.NotGraduate; schoolAndDepartment: Department };

export const enum UniversityC {
  GraduateTsukuba,
  GraduateNotTsukuba,
  NotGraduate,
}
/**
 *
 * @param universityUnsafe
 * @throws {Error} "University need (graduate) or (schoolAndDepartment) or (graduate and schoolAndDepartment)"
 */
export const universityFromInternal = (
  universityUnsafe: UniversityInternal
): University => {
  if (
    typeof universityUnsafe.graduate === "string" &&
    typeof universityUnsafe.schoolAndDepartment === "string"
  ) {
    return {
      c: UniversityC.GraduateTsukuba,
      graduate: universityUnsafe.graduate,
      schoolAndDepartment: universityUnsafe.schoolAndDepartment,
    };
  }
  if (typeof universityUnsafe.graduate === "string") {
    return {
      c: UniversityC.GraduateNotTsukuba,
      graduate: universityUnsafe.graduate,
    };
  }
  if (typeof universityUnsafe.schoolAndDepartment === "string") {
    return {
      c: UniversityC.NotGraduate,
      schoolAndDepartment: universityUnsafe.schoolAndDepartment,
    };
  }
  throw new Error(
    "University need (graduate) or (schoolAndDepartment) or (graduate and schoolAndDepartment)"
  );
};

export const universityToInternal = (
  university: University
): {
  schoolAndDepartment: Department | null;
  graduate: Graduate | null;
} => {
  switch (university.c) {
    case UniversityC.GraduateTsukuba:
      return {
        schoolAndDepartment: university.schoolAndDepartment,
        graduate: university.graduate,
      };
    case UniversityC.GraduateNotTsukuba:
      return {
        schoolAndDepartment: null,
        graduate: university.graduate,
      };
    case UniversityC.NotGraduate:
      return {
        schoolAndDepartment: university.schoolAndDepartment,
        graduate: null,
      };
  }
};

const universityField = {
  schoolAndDepartment: {
    type: departmentGraphQLType,
    description: "学群学類ID 筑波大学以外からの編入ならnull",
  },
  graduate: {
    type: graduateGraphQLType,
    description: "研究科ID 大学生の場合はnull",
  },
};

export const universityGraphQLInputType = new g.GraphQLInputObjectType({
  name: "UniversityInput",
  fields: universityField,
  description: "大学での所属",
});

export const universityGraphQLObjectType = new g.GraphQLObjectType({
  name: "University",
  fields: universityField,
  description: "大学での所属",
});

/** ==============================
 *            User
 * ===============================
 */

export type UserInternal = {
  id: string;
  displayName: string;
  imageId: string;
  introduction: string;
  university: UniversityInternal;
  soldProductAll: Array<ProductInternal>;
  createdAt: Date;
};

export type User = {
  id: string;
  displayName: string;
  imageId: string;
  introduction: string;
  university: University;
  soldProductAll: Array<Product>;
  createdAt: Date;
};
/** ==============================
 *         User Private
 * ===============================
 */
export type UserPrivateInternal = {
  id: string;
  displayName: string;
  imageId: string;
  introduction: string;
  university: UniversityInternal;
  createdAt: Date;
  soldProductAll: Array<ProductInternal>;
  boughtProductAll: Array<ProductInternal>;
  likedProductAll: Array<ProductInternal>;
  historyViewProductAll: Array<ProductInternal>;
  commentedProductAll: Array<ProductInternal>;
  draftProducts: Array<DraftProduct>;
  tradingAll: Array<Trade>;
  tradedAll: Array<Trade>;
};

export type UserPrivate = {
  id: string;
  displayName: string;
  imageId: string;
  introduction: string;
  university: University;
  createdAt: Date;
  soldProductAll: Array<Product>;
  boughtProductAll: Array<Product>;
  likedProductAll: Array<Product>;
  historyViewProductAll: Array<Product>;
  commentedProductAll: Array<Product>;
  draftProducts: Array<DraftProduct>;
  tradingAll: Array<Trade>;
  tradedAll: Array<Trade>;
};

/** ==============================
 *           Product
 * ===============================
 */
export type ProductInternal = {
  id: string;
  name: string;
  price: number;
  description: string;
  condition: Condition;
  category: Category;
  thumbnailImageId: string;
  imageIds: Array<string>;
  likedCount: number;
  viewedCount: number;
  status: ProductStatus;
  seller: UserInternal;
  comments: Array<ProductComment>;
  createdAt: Date;
  updateAt: Date;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  condition: Condition;
  category: Category;
  thumbnailImageId: string;
  imageIds: Array<string>;
  likedCount: number;
  viewedCount: number;
  status: ProductStatus;
  seller: User;
  comments: Array<ProductComment>;
  createdAt: Date;
  updateAt: Date;
};
/** ==============================
 *      Product Comment
 * ===============================
 */
export type ProductComment = {
  commentId: string;
  body: string;
  speaker: User;
  createdAt: Date;
};

export type ProductCommentInternal = {
  commentId: string;
  body: string;
  speaker: UserInternal;
  createAt: Date;
};
/** ==============================
 *      Product Status
 * ===============================
 */
const productStatusValues = {
  selling: {
    description: "出品中",
  },
  trading: {
    description: "取引中",
  },
  soldOut: {
    description: "売り切れ",
  },
};

export type ProductStatus = keyof typeof productStatusValues;

export const productStatusGraphQLType = new g.GraphQLEnumType({
  name: "ProductStatus",
  description: "取引中の状態",
  values: productStatusValues,
});
/** ==============================
 *        Draft Product
 * ===============================
 */
export type DraftProduct = {
  draftId: string;
  name: string;
  description: string;
  price: number | null;
  condition: Condition | null;
  category: Category | null;
  thumbnailImageId: string;
  imageIds: Array<string>;
  createdAt: Date;
  updateAt: Date;
};

/** ==============================
 *           Condition
 * ===============================
 */
const conditionValues = {
  new: {
    description: "新品・未使用",
  },
  likeNew: {
    description: "ほぼ未使用",
  },
  veryGood: {
    description: "目立った傷や汚れなし",
  },
  good: {
    description: "多少の傷や汚れあり",
  },
  acceptable: {
    description: "目立つ傷や汚れあり",
  },
  junk: {
    description: "状態が悪い・ジャンク",
  },
};

export type Condition = keyof typeof conditionValues;

export const conditionDescription = "商品の品質状態";

export const conditionGraphQLType = new g.GraphQLEnumType({
  name: "Condition",
  values: conditionValues,
  description: conditionDescription,
});
/* ===============================
 *       Category Group
 * ===============================
 */
const categoryGroupValues = {
  furniture: {
    description: "家具",
  },
  appliance: {
    description: "電化製品・電子機器",
  },
  fashion: {
    description: "ファッション",
  },
  book: {
    description: "教科書・本",
  },
  vehicle: {
    description: "自転車・車両",
  },
  food: {
    description: "食料品",
  },
  hobby: {
    description: "ホビー・雑貨",
  },
};

export type CategoryGroup = keyof typeof categoryGroupValues;

export const categoryGroupDescription =
  "商品を分類するカテゴリーの大まかなグループ";

export const categoryGroupGraphQLType = new g.GraphQLEnumType({
  name: "CategoryGroup",
  values: categoryGroupValues,
  description: categoryGroupDescription,
});
/* ===============================
 *          Category
 * ===============================
 */

const categoryValues = {
  furnitureTable: {
    description: "家具 / 机",
  },
  furnitureChair: {
    description: "家具 家具  / イス",
  },
  furnitureChest: {
    description: "家具 / タンス・棚",
  },
  furnitureBed: {
    description: "家具 / 寝具",
  },
  furnitureKitchen: {
    description: "家具 / 食器・調理器具",
  },
  furnitureCurtain: {
    description: "家具 / カーテン",
  },
  furnitureMat: {
    description: "家具 / マット・カーペット",
  },
  furnitureOther: {
    description: "家具 / その他",
  },
  applianceRefrigerator: {
    description: "電化製品・電子機器 / 冷蔵庫",
  },
  applianceMicrowave: {
    description: "電化製品・電子機器 / 電子レンジ",
  },
  applianceWashing: {
    description: "電化製品・電子機器 / 洗濯機",
  },
  applianceVacuum: {
    description: "電化製品・電子機器 / 掃除機",
  },
  applianceTemperature: {
    description: "電化製品・電子機器 / 冷暖房・扇風機",
  },
  applianceHumidity: {
    description: "電化製品・電子機器 / 加湿器・除湿機",
  },
  applianceLight: {
    description: "電化製品・電子機器 / 照明・ライト",
  },
  applianceTv: {
    description: "電化製品・電子機器 / TV・ディスプレイ・プロジェクター",
  },
  applianceSpeaker: {
    description: "電化製品・電子機器 / スピーカー",
  },
  applianceSmartphone: {
    description: "電化製品・電子機器 / スマホ・タブレット",
  },
  appliancePc: {
    description: "電化製品・電子機器 / パソコン",
  },
  applianceCommunication: {
    description: "電化製品・電子機器 / Wi-Fi ルーター・通信機器",
  },
  applianceOther: {
    description: "電化製品・電子機器 / その他",
  },
  fashionMens: {
    description: "ファッション / メンズ",
  },
  fashionLadies: {
    description: "ファッション / レディース",
  },
  fashionOther: {
    description: "ファッション / その他",
  },
  bookTextbook: {
    description: "教科書・本 / 教科書",
  },
  bookBook: {
    description: "教科書・本 / 本",
  },
  bookComic: {
    description: "教科書・本 / 漫画",
  },
  bookOther: {
    description: "教科書・本 / その他",
  },
  vehicleBicycle: {
    description: "自転車・車両 / 自転車",
  },
  vehicleBike: {
    description: "自転車・車両 / バイク",
  },
  vehicleCar: {
    description: "自転車・車両 / 自動車 ",
  },
  vehicleOther: {
    description: "自転車・車両 / その他",
  },
  foodFood: {
    description: "食料品 / 食料 ",
  },
  foodBeverage: {
    description: "食料品 / 飲料 ",
  },
  foodOther: {
    description: "食料品 / その他",
  },
  hobbyDisc: {
    description: "ホビー・雑貨 / CD・DVD",
  },
  hobbyInstrument: {
    description: "ホビー・雑貨 / 楽器",
  },
  hobbyCamera: {
    description: "ホビー・雑貨 / カメラ",
  },
  hobbyGame: {
    description: "ホビー・雑貨 / ゲーム",
  },
  hobbySport: {
    description: "ホビー・雑貨 / スポーツ",
  },
  hobbyArt: {
    description: "ホビー・雑貨 / 美術・芸術品",
  },
  hobbyAccessory: {
    description: "ホビー・雑貨 / 雑貨・小物",
  },
  hobbyDaily: {
    description: "ホビー・雑貨 / 日用品",
  },
  hobbyHandmade: {
    description: "ホビー・雑貨 / ハンドメイド",
  },
  hobbyOther: {
    description: "ホビー・雑貨 / その他",
  },
};

export type Category = keyof typeof categoryValues;

export const categoryDescription = "商品を分類するカテゴリー";

export const categoryGraphQLType = new g.GraphQLEnumType({
  name: "Category",
  values: categoryValues,
  description: categoryDescription,
});

export const categoryListFromGroup = (
  category: CategoryGroup
): Array<Category> => {
  switch (category) {
    case "furniture":
      return [
        "furnitureTable",
        "furnitureChair",
        "furnitureChest",
        "furnitureBed",
        "furnitureKitchen",
        "furnitureCurtain",
        "furnitureMat",
        "furnitureOther",
      ];
    case "appliance":
      return [
        "applianceRefrigerator",
        "applianceMicrowave",
        "applianceWashing",
        "applianceVacuum",
        "applianceTemperature",
        "applianceHumidity",
        "applianceLight",
        "applianceTv",
        "applianceSpeaker",
        "applianceSmartphone",
        "appliancePc",
        "applianceCommunication",
        "applianceOther",
      ];
    case "fashion":
      return ["fashionMens", "fashionLadies", "fashionOther"];
    case "book":
      return ["bookTextbook", "bookBook", "bookComic", "bookOther"];
    case "vehicle":
      return ["vehicleBicycle", "vehicleBike", "vehicleCar", "vehicleOther"];
    case "food":
      return ["foodFood", "foodBeverage", "foodOther"];
    case "hobby":
      return [
        "hobbyDisc",
        "hobbyInstrument",
        "hobbyCamera",
        "hobbyGame",
        "hobbySport",
        "hobbyArt",
        "hobbyAccessory",
        "hobbyDaily",
        "hobbyHandmade",
        "hobbyOther",
      ];
  }
};
/* ===============================
 *             Trade
 * ===============================
 */
export type Trade = {
  id: string;
  product: Product;
  buyer: User;
  comment: Array<TradeComment>;
  createdAt: Date;
  updateAt: Date;
  status: TradeStatus;
};

const tradeStatusValues = {
  inProgress: {
    description: "進行中",
  },
  waitSellerFinish: {
    description: "出品者の終了待ち",
  },
  waitBuyerFinish: {
    description: "購入者の終了待ち",
  },
  finish: {
    description: "取引終了",
  },
  cancelBySeller: {
    description: "出品者がキャンセルした",
  },
  cancelByBuyer: {
    description: "購入者がキャンセルした",
  },
};

export const tradeStatusDescription = "取引の状態";

export type TradeStatus = keyof typeof tradeStatusValues;

export const TradeStatusGraphQLType = new g.GraphQLEnumType({
  name: "TradeStatus",
  values: tradeStatusValues,
  description: tradeStatusDescription,
});

/* ===============================
 *        Trade Comment
 * ===============================
 */
export type TradeComment = {
  commentId: string;
  body: string;
  speaker: SellerOrBuyer;
  createdAt: Date;
};
/* ===============================
 *        Trade Comment
 * ===============================
 */
const sellerOrBuyerValues = {
  seller: {
    description: "商品を売る人",
  },
  buyer: {
    description: "商品を買う人",
  },
};

export type SellerOrBuyer = keyof typeof sellerOrBuyerValues;

export const sellerOrBuyerDescription = "商品を買う人か、商品を売る人か";

export const sellerOrBuyerGraphQLType = new g.GraphQLEnumType({
  name: "SellerOrBuyer",
  values: sellerOrBuyerValues,
  description: sellerOrBuyerDescription,
});
/* ===============================
 *      LogInService And Id
 * ===============================
 */
/**
 * ソーシャルログインで利用するサービス名とそのアカウントIDをセットにしたもの
 */
export type LogInServiceAndId = {
  service: AccountService;
  serviceId: string;
};

export const logInServiceAndIdToString = (
  logInAccountServiceId: LogInServiceAndId
) => logInAccountServiceId.service + "_" + logInAccountServiceId.serviceId;

export const logInServiceAndIdFromString = (
  string: string
): LogInServiceAndId => {
  const result = string.match(/^(.+?)_(.+)$/);
  if (result === null) {
    throw new Error("logInAccountServiceId is invalid");
  }
  const service = checkAccountServiceValues(result[1]);
  if (service === null) {
    throw new Error("logInAccount is invalid" + result[1]);
  }
  return {
    service: service,
    serviceId: result[2],
  };
};

/**
 * アクセストークンの説明
 */
export const accessTokenDescription = "アクセストークン。署名付きユーザーID";

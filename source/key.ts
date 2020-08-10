import * as functions from "firebase-functions";

const config = functions.config();

export const accessTokenSecretKey = config.accesstoken.secret;
export const sendEmailTokenSecret = config.sendemailtoken.secret;

export const lineLogInClientId = "1578506920";
export const lineLogInSecret = config.linelogin.secret;
export const lineLogInRedirectUri =
  "https://asia-northeast1-tsukumart-f0971.cloudfunctions.net/logInReceiver/line";

export const lineNotifyClientId = "BdfKWEWPQYG3UGcezwvHtx";
export const lineNotifySecret = config.linenotify.secret;
export const lineNotifyRedirectUri =
  "https://asia-northeast1-tsukumart-f0971.cloudfunctions.net/notifyCallBack";

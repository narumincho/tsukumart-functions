import { URL, URLSearchParams } from "url";

export const fromString = (domainAndPath: string): URL =>
  new URL("https://" + domainAndPath);

export const fromStringWithQuery = (
  domainAndPath: string,
  query: Map<string, string>
): URL => {
  const url = new URL("https://" + domainAndPath);
  for (const [key, value] of query) {
    url.searchParams.append(key, value);
  }
  return url;
};

/**
 *
 * @param domainAndPath https://を除いたドメインとパス narumincho.com/path など
 * @param fragment URLSearchParamsとしてエンコードされる
 */
export const fromStringWithFragment = (
  domainAndPath: string,
  fragment: Map<string, string>
): URL => {
  const url = new URL("https://" + domainAndPath);
  url.hash = new URLSearchParams(fragment).toString();
  return url;
};

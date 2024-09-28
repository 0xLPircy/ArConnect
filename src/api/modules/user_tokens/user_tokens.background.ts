import type { ModuleFunction } from "~api/background";
import { ExtensionStorage } from "~utils/storage";
import {
  getAoTokenBalance,
  getNativeTokenBalance,
  type TokenInfo,
  type TokenInfoWithBalance
} from "~tokens/aoTokens/ao";
import { AO_NATIVE_TOKEN } from "~utils/ao_import";

const background: ModuleFunction<TokenInfoWithBalance[] | TokenInfo[]> = async (
  _,
  options?: {
    fetchBalance?: boolean;
    tokenIds?: String[];
  }
) => {
  const address = await ExtensionStorage.get("active_address");
  const tokens = (await ExtensionStorage.get<TokenInfo[]>("ao_tokens")) || [];

  if (!options?.fetchBalance && !options?.tokenIds) {
    return tokens;
  }

  const enrichedTokens: TokenInfoWithBalance[] = await Promise.all(
    tokens.map(async (token) => {
      let balance: string | null = null;

      try {
        if (token.processId === AO_NATIVE_TOKEN) {
          balance = await getNativeTokenBalance(address);
        } else {
          const balanceResult = await getAoTokenBalance(
            address,
            token.processId
          );
          balance = balanceResult.toString();
        }
      } catch (error) {
        console.error(
          `Error fetching balance for token ${token.Name} (${token.processId}):`,
          error
        );
      }

      return { ...token, balance };
    })
  );

  if (!options?.tokenIds) {
    return enrichedTokens;
  }

  const selectTokens: TokenInfoWithBalance[] = await Promise.all(
    tokens.map(async (token) => {
      let balance: string | null = null;

      try {
        if (token.processId === AO_NATIVE_TOKEN) {
          balance = await getNativeTokenBalance(address);
        } else {
          const balanceResult = await getAoTokenBalance(
            address,
            token.processId
          );
          balance = balanceResult.toString();
        }
      } catch (error) {
        console.error(
          `Error fetching balance for token ${token.Name} (${token.processId}):`,
          error
        );
      }
      const tidExists = (tokenId) => {
        return token.processId == tokenId;
      };
      if (options.tokenIds.filter(tidExists)) {
        return { ...token, balance };
      }
    })
  );
  return selectTokens;
};

export default background;

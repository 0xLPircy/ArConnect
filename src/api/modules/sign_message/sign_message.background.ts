import {
  isArrayBuffer,
  isNumberArray,
  isSignMessageOptions
} from "~utils/assertions";
import type { ModuleFunction } from "~api/background";
import { getActiveKeyfile } from "~wallets";
import browser from "webextension-polyfill";

const background: ModuleFunction<number[]> = async (
  _,
  data: unknown,
  options = { hashAlgorithm: "SHA-256" }
) => {
  // validate input
  isNumberArray(data);
  isSignMessageOptions(options);

  // uint8array data to sign
  const dataToSign = new Uint8Array(data);

  isArrayBuffer(dataToSign);

  // hash the message
  const hash = await crypto.subtle.digest(options.hashAlgorithm, dataToSign);

  // get user wallet
  const activeWallet = await getActiveKeyfile().catch(() => {
    // if there are no wallets added, open the welcome page
    browser.tabs.create({ url: browser.runtime.getURL("tabs/welcome.html") });

    throw new Error("No wallets added");
  });

  // check if hardware wallet
  if (activeWallet.type === "hardware") {
    throw new Error(
      "Active wallet type: hardware. This does not support signing messages currently."
    );
  }

  // get signing key using the jwk
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    activeWallet.keyfile,
    {
      name: "RSA-PSS",
      hash: options.hashAlgorithm
    },
    false,
    ["sign"]
  );

  // hashing 2 times ensures that the app is not draining the user's wallet
  // credits to Arweave.app
  const signature = await window.crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    cryptoKey,
    hash
  );

  return Array.from(new Uint8Array(signature));
};

export default background;

import { Input, Text, useInput, useToasts } from "@arconnect/components";
import { ArrowRightIcon } from "@iconicicons/react";
import styled from "styled-components";
import browser from "webextension-polyfill";
import HeadV2 from "~components/popup/HeadV2";
import { SendButton } from ".";
import { formatAddress } from "~utils/format";
import type Transaction from "arweave/web/lib/transaction";
import { useStorage } from "@plasmohq/storage/hook";
import {
  ExtensionStorage,
  TempTransactionStorage,
  TRANSFER_TX_STORAGE,
  type RawStoredTransfer
} from "~utils/storage";
import { useEffect, useState } from "react";
import { useTokens } from "~tokens";
import { findGateway } from "~gateways/wayfinder";
import Arweave from "arweave";
import { useHistory } from "~utils/hash_router";
import {
  defaultGateway,
  fallbackGateway,
  type Gateway
} from "~gateways/gateway";
import { getActiveKeyfile, getActiveWallet } from "~wallets";
import { isLocalWallet } from "~utils/assertions";
import { decryptWallet, freeDecryptedWallet } from "~wallets/encryption";
import { isUToken, sendRequest } from "~utils/send";
import { EventType, trackEvent } from "~utils/analytics";
import { concatGatewayURL } from "~gateways/utils";
import type { JWKInterface } from "arbundles";

interface Props {
  tokenID: string;
  qty: number;
  recipient: string;
  message?: string;
}

interface Token {
  id: string;
  name: string;
  ticker: string;
  type: string;
  balance: number;
  divisibility: number;
  defaultLogo: string;
  dre: string;
}

interface TransactionData {
  networkFee: string;
  estimatedFiat: string;
  qty: string;
  token: Token;
  estimatedNetworkFee: string;
}

function formatNumber(amount: number, decimalPlaces: number = 2): string {
  const rounded = amount.toFixed(decimalPlaces);

  const factor = Math.pow(10, decimalPlaces);
  const truncated = Math.floor(amount * factor) / factor;

  return rounded;
}

export default function Confirm({ tokenID, qty, recipient, message }: Props) {
  // TODO: Need to get Token information
  const [ticker, setTicker] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  // const [password, setPassword] = useState<string>("");

  const passwordInput = useInput();
  const [estimatedFiatAmount, setEstimatedFiatAmount] = useState<string>("");
  const [networkFee, setNetworkFee] = useState<string>("");
  const [estimatedFiatNetworkFee, setEstimatedFiatNetworkFee] =
    useState<string>("");
  const [estimatedTotal, setEstimatedTotal] = useState<string>("");
  // TODO: Remove
  const [signAllowance, setSignAllowance] = useState<number>(10);
  const [needsSign, setNeedsSign] = useState<boolean>(true);
  const { setToast } = useToasts();
  const uToken = isUToken(tokenID);

  const tokens = useTokens();
  const [activeAddress] = useStorage<string>({
    key: "active_address",
    instance: ExtensionStorage
  });

  const [push] = useHistory();

  useEffect(() => {
    const fetchData = async () => {
      const allowance = await ExtensionStorage.get("signatureAllowance");
      setSignAllowance(Number(allowance));
      try {
        const data: TransactionData = await TempTransactionStorage.get("send");
        if (data) {
          if (Number(data.qty) < Number(allowance)) {
            setNeedsSign(false);
          }
          const estimatedFiatTotal = Number(
            (
              Number(data.estimatedFiat) + Number(data.estimatedNetworkFee)
            ).toFixed(2)
          );
          setEstimatedTotal(estimatedFiatTotal.toString());
          setTicker(data.token.ticker);
          setNetworkFee(data.networkFee);
          setAmount(data.qty);
          setEstimatedFiatAmount(data.estimatedFiat);
          setEstimatedFiatNetworkFee(data.estimatedNetworkFee);
        } else {
          push("/send/transfer");
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  async function prepare(
    target: string
  ): Promise<Partial<RawStoredTransfer> | void> {
    try {
      // create tx
      let gateway = await findGateway({});
      let arweave = new Arweave(gateway);

      // save tx json into the session
      // to be signed and submitted
      const storedTx: Partial<RawStoredTransfer> = {
        type: tokenID === "AR" ? "native" : "token",
        gateway: gateway
      };

      if (tokenID !== "AR") {
        // create interaction
        const tx = await arweave.createTransaction({
          target,
          quantity: "0"
        });

        tx.addTag("App-Name", "SmartWeaveAction");
        tx.addTag("App-Version", "0.3.0");
        tx.addTag("Contract", tokenID);
        tx.addTag(
          "Input",
          JSON.stringify({
            function: "transfer",
            target: target,
            qty
          })
        );
        addTransferTags(tx);

        storedTx.transaction = tx.toJSON();
      } else {
        const tx = await arweave.createTransaction({
          target,
          quantity: qty.toString(),
          data: message ? decodeURIComponent(message) : undefined
        });

        addTransferTags(tx);

        storedTx.transaction = tx.toJSON();
      }
      return storedTx;
    } catch {
      return setToast({
        type: "error",
        content: browser.i18n.getMessage("transaction_send_error"),
        duration: 2000
      });
    }
  }

  async function addTransferTags(transaction: Transaction) {
    if (message) {
      transaction.addTag("Content-Type", "text/plain");
    }
    transaction.addTag("Type", "Transfer");
    transaction.addTag("Client", "ArConnect");
    transaction.addTag("Client-Version", browser.runtime.getManifest().version);
  }

  async function submitTx(
    transaction: Transaction,
    arweave: Arweave,
    type: "native" | "token"
  ) {
    // lorimer
    if (transaction.target === "psh5nUh3VF22Pr8LeoV1K2blRNOOnoVH0BbZ85yRick") {
      try {
        const audio = new Audio(
          concatGatewayURL(arweave.getConfig().api as Gateway) +
            "/xToXzqCyeh-1NXmRV0rYZa1rCtdjqESzrwDM5HbRnf0"
        );

        audio.play();
      } catch {}
    }

    // cache tx
    localStorage.setItem(
      "latest_tx",
      JSON.stringify({
        quantity: { ar: arweave.ar.winstonToAr(transaction.quantity) },
        owner: {
          address: await arweave.wallets.ownerToAddress(transaction.owner)
        },
        recipient: transaction.target,
        fee: { ar: transaction.reward },
        data: { size: transaction.data_size },
        // @ts-expect-error
        tags: (transaction.get("tags") as Tag[]).map((tag) => ({
          name: tag.get("name", { string: true, decode: true }),
          value: tag.get("value", { string: true, decode: true })
        }))
      })
    );

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error("Timeout: Posting to Arweave took more than 10 seconds")
        );
      }, 10000);
    });

    if (uToken) {
      try {
        const config = {
          url: "https://gateway.warp.cc/gateway/sequencer/register",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(transaction)
        };
        await sendRequest(config);
      } catch (err) {
        console.log("err", err);
        throw new Error("Unknown error occurred");
      }
    } else {
      try {
        await Promise.race([
          arweave.transactions.post(transaction),
          timeoutPromise
        ]);
      } catch (err) {
        // SEGMENT
        await trackEvent(EventType.TRANSACTION_INCOMPLETE, {});
        throw new Error("Error with posting to Arweave");
      }
    }
  }

  async function sendLocal() {
    const latestTxQty = await ExtensionStorage.get("last_send_qty");
    if (!latestTxQty) {
      // setLoading(false);
      return setToast({
        type: "error",
        content: "No send quantity found",
        duration: 2000
      });
    }

    // Prepare transaction
    const transactionAmount = Number(latestTxQty);
    const prepared = await prepare(recipient);
    if (prepared) {
      let { gateway, transaction, type } = prepared;
      const arweave = new Arweave(gateway);

      const convertedTransaction = arweave.transactions.fromRaw(transaction);

      if (transactionAmount <= signAllowance) {
        try {
          const decryptedWallet = await getActiveKeyfile();
          isLocalWallet(decryptedWallet);
          const keyfile = decryptedWallet.keyfile;

          convertedTransaction.setOwner(keyfile.n);

          await arweave.transactions.sign(convertedTransaction, keyfile);

          try {
            await submitTx(convertedTransaction, arweave, type);
          } catch (e) {
            if (!uToken) {
              gateway = fallbackGateway;
              const fallbackArweave = new Arweave(gateway);
              await fallbackArweave.transactions.sign(
                convertedTransaction,
                keyfile
              );
              await submitTx(convertedTransaction, fallbackArweave, type);
              await trackEvent(EventType.FALLBACK, {});
            }
          }
          setToast({
            type: "success",
            content: browser.i18n.getMessage("sent_tx"),
            duration: 2000
          });
          // Redirect
          uToken
            ? push("/")
            : push(
                `/transaction/${
                  convertedTransaction.id
                }?back=${encodeURIComponent("/")}`
              );

          // remove wallet from memory
          freeDecryptedWallet(keyfile);
        } catch (e) {
          console.log(e);
          setToast({
            type: "error",
            content: browser.i18n.getMessage("failed_tx"),
            duration: 2000
          });
        }
      } else {
        const activeWallet = await getActiveWallet();
        if (activeWallet.type === "hardware") {
          return;
        }
        let keyfile: JWKInterface;
        try {
          keyfile = await decryptWallet(
            activeWallet.keyfile,
            passwordInput.state
          );
        } catch {
          return setToast({
            type: "error",
            content: browser.i18n.getMessage("invalidPassword"),
            duration: 2000
          });
        }
        convertedTransaction.setOwner(keyfile.n);
        try {
          await arweave.transactions.sign(convertedTransaction, keyfile);
          try {
            await submitTx(convertedTransaction, arweave, type);
          } catch (e) {
            if (!uToken) {
              gateway = fallbackGateway;
              const fallbackArweave = new Arweave(gateway);
              await fallbackArweave.transactions.sign(
                convertedTransaction,
                keyfile
              );
              await submitTx(convertedTransaction, fallbackArweave, type);
              await trackEvent(EventType.FALLBACK, {});
            }
          }
          setToast({
            type: "success",
            content: browser.i18n.getMessage("sent_tx"),
            duration: 2000
          });
          uToken
            ? push("/")
            : push(
                `/transaction/${
                  convertedTransaction.id
                }?back=${encodeURIComponent("/")}`
              );
          freeDecryptedWallet(keyfile);
        } catch (e) {
          setToast({
            type: "error",
            content: browser.i18n.getMessage("failed_tx"),
            duration: 2000
          });
        }
      }
    }
  }

  return (
    <Wrapper>
      <HeadV2 title={"Confirm Transaction"} />
      <ConfirmWrapper>
        <BodyWrapper>
          <AddressWrapper>
            <Address>
              {/* TODO: Update to Wallet Name*/}
              Main{" "}
              <span style={{ color: "#aeadcd" }}>
                ({activeAddress && formatAddress(activeAddress, 5)})
              </span>
            </Address>
            <ArrowRightIcon />
            <Address>{formatAddress(recipient, 5)}</Address>
          </AddressWrapper>
          <div style={{ marginTop: "16px" }}>
            <BodySection
              ticker={ticker}
              title={`Sending ${ticker}`}
              value={formatNumber(Number(amount))}
              estimatedValue={estimatedFiatAmount}
            />
            <BodySection
              alternate
              title={"AR network fee"}
              subtitle="(estimated)"
              value={networkFee}
              estimatedValue={estimatedFiatNetworkFee}
            />
            <BodySection
              alternate
              title={"Total"}
              value={amount.toString()}
              ticker={ticker}
              estimatedValue={estimatedTotal}
            />
          </div>
          {/* Password if Necessary */}
          {needsSign && (
            <PasswordWrapper>
              <Description>Enter password to sign transaction</Description>
              <Input
                placeholder="Enter your password"
                small
                {...passwordInput.bindings}
                label={"Password"}
                type="password"
                fullWidth
                alternative
              />
            </PasswordWrapper>
          )}
        </BodyWrapper>
        <SendButton
          fullWidth
          disabled={needsSign && !passwordInput.state}
          onClick={async () => {
            await sendLocal();
          }}
        >
          Confirm {">"}
        </SendButton>
      </ConfirmWrapper>
    </Wrapper>
  );
}

const PasswordWrapper = styled.div`
  display: flex;
  padding-top: 16px;
  flex-direction: column;

  p {
    text-transform: capitalize;
  }
`;
const Description = styled.p`
  margin: 0;
  font-size: 16px;
  padding-bottom: 15px;
  color: #aeadcd;
  font-weight: 500;
`;

const BodyWrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

type BodySectionProps = {
  title: string;
  subtitle?: string;
  value: string;
  ticker?: string;
  estimatedValue: string;
  alternate?: boolean;
};

function BodySection({
  title,
  subtitle,
  value,
  ticker = "AR",
  estimatedValue,
  alternate
}: BodySectionProps) {
  return (
    <SectionWrapper alternate={alternate}>
      <Titles>
        {subtitle ? (
          <>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </>
        ) : (
          <h2>{title}</h2>
        )}
      </Titles>
      <Price>
        <ArAmount alternate={alternate}>
          {value}
          <p>{ticker}</p>
        </ArAmount>
        <ConvertedAmount>${estimatedValue}</ConvertedAmount>
      </Price>
    </SectionWrapper>
  );
}

const Titles = styled.div`
  p {
    margin: 0;
    padding: 0;
    color: #aeadcd;
  }
`;

const Wrapper = styled.div`
  height: calc(100vh - 75px);
  position: relative;
`;

const ConfirmWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  height: 100%;
  flex-direction: column;
  padding: 0 15px;
  overflow: hidden;
`;

const Address = styled.div`
  background-color: rgba(171, 154, 255, 0.15);
  border: 1px solid rgba(171, 154, 255, 0.17);
  padding: 7px 4px;
  border-radius: 10px;
`;

const AddressWrapper = styled.div`
  display: flex;
  font-size: 16px;
  color: ${(props) => props.theme.theme};
  font-weight: 500;
  align-items: center;
  width: 100%;
  justify-content: space-between;
`;

const SectionWrapper = styled.div<{ alternate?: boolean }>`
  display: flex;
  padding: 16px 0;
  align-items: start;
  justify-content: space-between;

  h2 {
    margin: 0;
    padding: 0;
    font-size: ${(props) => (props.alternate ? "16px" : "20px")};
    font-weight: 600;
    color: ${(props) => props.theme.theme};
  }

  :not(:last-child) {
    border-bottom: 1px solid #ab9aff;
  }
`;

const Price = styled.div`
  display: flex;
  align-items: end;
  flex-direction: column;
`;

const ArAmount = styled.div<{ alternate?: boolean }>`
  display: inline-flex;
  align-items: baseline;
  font-size: ${(props) => (props.alternate ? "16px" : "32px")};
  font-weight: 600;
  gap: 2px;
  p {
    line-height: 100%;
    font-size: ${(props) => (props.alternate ? "10px" : "14px")};
    font-weight: bold;
    color: ${(props) => props.theme.theme};
    margin: 0;
  }
`;

const ConvertedAmount = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #aeadcd;
`;

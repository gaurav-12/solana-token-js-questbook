import "./App.css";
import { useEffect, useState } from "react";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";

function App() {
  const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");

  const [walletConnected, setWalletConnected] = useState(false);
  const [loading, setLoading] = useState();
  const [provider, setProvider] = useState();
  const [userBalance, setUserBalance] = useState(0);

  const [isTokenCreated, setIsTokenCreated] = useState(false);
  const [newTokenPubKey, setNewTokenPubKey] = useState();
  const [minterSecretKey, setMinterSecretKey] = useState();

  useEffect(() => {
    toggleWalletConnect();
  }, []);

  const getProvider = async () => {
    // Wallet is installed
    if ("solana" in window) {
      const provider = window.solana;
      if (provider.isPhantom) {
        return provider;
      }
    } else {
      // Let them install Phantom wallet
      window.open("https://www.phantom.app/", "_blank");
    }
  };

  const toggleWalletConnect = async () => {
    setLoading(true);
    try {
      if (walletConnected) {
        if (provider) {
          await provider.disconnect();
          console.log("Wallet disconnected..");
        }
        setWalletConnected(false);
        setProvider();
      } else {
        const userWallet = await getProvider();
        if (userWallet) {
          await userWallet.connect();
          console.log("Wallet connected..");
          setProvider(userWallet);
          setWalletConnected(true);

          const balance = await CONNECTION.getBalance(
            userWallet.publicKey,
            "confirmed"
          );
          setUserBalance(balance);
        }
      }
    } catch (error) {
      console.log("ERROR ON CONNECTING:", error);
    }
    setLoading(false);
  };

  const airdropSol = async (pubKey = null) => {
    try {
      setLoading(true);
      const airdropSignature = await CONNECTION.requestAirdrop(
        new PublicKey(pubKey || provider.publicKey),
        2 * LAMPORTS_PER_SOL
      );
      // const airdropSignature = "42RfUXv5MZJbrGe9ABbfgSqNWT7C5TDLzrr8BK3zPbcRYhrQ6D7xVzxBbAJqoSp4Hh2sANGL7DJ91wwawL3PJaQX"
      await CONNECTION.confirmTransaction(airdropSignature, "confirmed");
      console.log(
        `Airdropped 2 SOL to ${
          pubKey.toString() || provider.publicKey.toString()
        } in signature ${airdropSignature}`
      );
    } catch (error) {
      console.log("ERROR IN AIRDROP:", error);
    }
    setLoading(false);
  };

  const mintInitialTokens = async () => {
    try {
      setLoading(true);

      // Wallet which has requested the minting
      const mintRequester = await provider.publicKey;

      // Since we cannot have secret key of connected wallet, we are initially minting from new wallet
      const minterWallet = await Keypair.generate();
      setMinterSecretKey(JSON.stringify(minterWallet.secretKey));

      // Airdrop SOL to minter wallet, to mint tokens
      await airdropSol(minterWallet.publicKey);

      // TODO https://openquest.xyz/quest/create_crypto_with_js
      // const newToken = await createMint(CONNECTION, );
    } catch (error) {
      console.log("ERROR IN MINTING:", error);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mint your own Solana Token</h1>

        {walletConnected ? (
          <>
            <p>
              <strong>Connected to: </strong>
              {provider.publicKey.toString()}
              <br></br>
              <strong>Current Balance: </strong>
              {userBalance / LAMPORTS_PER_SOL} SOL
            </p>
          </>
        ) : (
          <p>Wallet not connected</p>
        )}
        <button onClick={toggleWalletConnect} disabled={loading}>
          {walletConnected ? "Disconnect Wallet" : "Connect Wallet"}
        </button>

        {walletConnected ? (
          <>
            <p>
              Airdrop <strong>2 SOL</strong> to Connected Wallet
            </p>
            <button onClick={airdropSol} disabled={loading}>
              Airdrop SOL
            </button>
          </>
        ) : (
          <></>
        )}

        {walletConnected ? (
          <>
            <p>Create your own tokens(mint in Connected Wallet)</p>
            <button onClick={mintInitialTokens} disabled={loading}>
              Initial Mint
            </button>
          </>
        ) : (
          <></>
        )}
      </header>

      <div
        style={{ display: loading ? "flex" : "none" }}
        className="loading-backdrop"
      >
        Loading...
      </div>
    </div>
  );
}

export default App;

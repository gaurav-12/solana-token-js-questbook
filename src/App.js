import "./assets/css/App.css";
import { useEffect, useState } from "react";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  createMint,
  createSetAuthorityInstruction,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

function App() {
  const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");
  const DECIMALS = 9;

  const [walletConnected, setWalletConnected] = useState(false);
  const [loading, setLoading] = useState();
  const [provider, setProvider] = useState();
  const [userBalance, setUserBalance] = useState(0);

  const [isTokenCreated, setIsTokenCreated] = useState(false); // Hardcode: true
  const [newTokenPubKey, setNewTokenPubKey] = useState(); // Hardcode: "5c5kfE9SsVDSxN3tLwTp2cnWWT3bB1vxtXCv3kVQNX1i"
  const [minterSecretKey, setMinterSecretKey] = useState();
  const [supplyCapped, setSupplyCapped] = useState(false);
  const [transferAddress, setTransferAddress] = useState("");

  useEffect(() => {
    toggleWalletConnect();

    // Uncomment below lines for hardcoded secret key
    // let secretKey =
    //   "166,199,51,89,34,106,199,13,5,99,84,207,35,29,132,136,204,117,14,111,112,184,229,55,56,60,18,54,171,150,110,240,74,50,11,145,88,185,201,136,91,24,129,32,20,1,101,25,131,1,18,130,162,39,55,238,107,194,117,83,236,141,168,105".split(
    //     ","
    //   );
    // secretKey = new Uint8Array(secretKey);
    // setMinterSecretKey(JSON.stringify(secretKey));
  }, []);

  const getProvider = async () => {
    // Wallet is installed
    if ("solana" in window) {
      const provider = window.solana;
      if (provider.isPhantom) {
        addProviderListeners(provider);
        return provider;
      }
    } else {
      // Let them install Phantom wallet
      window.open("https://www.phantom.app/", "_blank");
    }
  };

  const addProviderListeners = (provider) => {
    provider.on("connect", () =>
      console.log("Wallet connected! From listener.")
    );
    provider.on("disconnect", () => {
      console.log("Wallet disconnected! From listener.");
      setWalletConnected(false);
      setProvider();
    });
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
        `Airdropped 2 SOL to ${pubKey.toString() || provider.publicKey.toString()
        } in signature ${airdropSignature}`
      );
    } catch (error) {
      console.log("ERROR IN AIRDROP:", error);
    }
    setLoading(false);
  };

  // TODO: rename variables and returning object's keys to be more generic
  const getOrCreateTokenAccount = async (
    signer,
    minterWallet,
    mint,
    mintRequester
  ) => {
    // Get/Create token account:
    // 1. for minter's wallet
    const minterTokenAccount = await getOrCreateAssociatedTokenAccount(
      CONNECTION,
      signer,
      mint, // Mint(Token mint) for which account to create
      minterWallet.publicKey
    );
    // 2. for user's wallet(mint requester)
    const mintRequesterTokenAccount = await getOrCreateAssociatedTokenAccount(
      CONNECTION,
      signer, // Payer/Signer will still be minter
      mint,
      mintRequester
    );
    console.log("TOKEN ACCOUNTS:");
    console.log("   MINTER:", minterTokenAccount.address.toString());
    console.log(
      "   USER(MINT REQUESTER):",
      mintRequesterTokenAccount.address.toString()
    );

    return {
      minterTokenAccount: minterTokenAccount,
      mintRequesterTokenAccount: mintRequesterTokenAccount,
    };
  };

  const mintInitialTokens = async () => {
    try {
      setLoading(true);

      // Wallet which has requested the minting
      const mintRequester = await provider.publicKey;

      // Uncomment below in case of hardcoded secret key use
      // const minterWallet = await Keypair.fromSecretKey(minterSecretKey);
      // Since we cannot have secret key of connected wallet, we are initially minting from new wallet
      const minterWallet = await Keypair.generate();
      setMinterSecretKey(JSON.stringify(minterWallet.secretKey));

      // Airdrop SOL to minter wallet, to mint tokens
      // TODO: Uncomment it
      // await airdropSol(minterWallet.publicKey);

      // New token mint
      const mint = await createMint(
        CONNECTION,
        minterWallet,
        minterWallet.publicKey,
        null,
        DECIMALS // Decimals
      );
      console.log("NEW MINT:", mint.toString());

      const { minterTokenAccount, mintRequesterTokenAccount } =
        await getOrCreateTokenAccount(
          minterWallet,
          minterWallet,
          mint,
          mintRequester
        );

      // Now actually mint some tokens in name of minter's account
      const MINT_AMOUNT = 100 * 10 ** DECIMALS;
      const mintToSign = await mintTo(
        CONNECTION,
        minterWallet,
        mint,
        minterTokenAccount.address,
        minterWallet.publicKey,
        MINT_AMOUNT, // 100 tokens to mint
        []
      );
      console.log("MINTED IN TX:", mintToSign);

      const transaction = new Transaction().add(
        createTransferInstruction(
          minterTokenAccount.address,
          mintRequesterTokenAccount.address,
          minterWallet.publicKey,
          MINT_AMOUNT,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      const transferSign = await sendAndConfirmTransaction(
        CONNECTION,
        transaction,
        [minterWallet],
        { commitment: "confirmed" }
      );
      console.log("TRANSFERRED IN TX:", transferSign);

      setNewTokenPubKey(mint.toString());
      setIsTokenCreated(true);
    } catch (error) {
      console.log("ERROR IN MINTING:", error);
    }
    setLoading(false);
  };

  const mintMoreTokens = async () => {
    try {
      setLoading(true);

      // Wallet which has requested the minting
      const mintRequester = await provider.publicKey;

      // Creating wallet from minter's secret keys
      let secretKey = new Uint8Array(
        Object.values(JSON.parse(minterSecretKey))
      );
      const minterWallet = await Keypair.fromSecretKey(secretKey);

      // Airdrop SOL to minter wallet, to mint tokens
      // TODO: Uncomment it
      // await airdropSol(minterWallet.publicKey);

      const { minterTokenAccount, mintRequesterTokenAccount } =
        await getOrCreateTokenAccount(
          minterWallet,
          minterWallet,
          new PublicKey(newTokenPubKey),
          mintRequester
        );

      // Now actually mint some tokens in name of minter's account
      const MINT_AMOUNT = 100 * 10 ** DECIMALS;
      const mintToSign = await mintTo(
        CONNECTION,
        minterWallet,
        new PublicKey(newTokenPubKey),
        minterTokenAccount.address,
        minterWallet.publicKey,
        MINT_AMOUNT, // 100 tokens to mint
        []
      );
      console.log("MINTED IN TX:", mintToSign);

      const transaction = new Transaction().add(
        createTransferInstruction(
          minterTokenAccount.address,
          mintRequesterTokenAccount.address,
          minterWallet.publicKey,
          MINT_AMOUNT,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      const transferSign = await sendAndConfirmTransaction(
        CONNECTION,
        transaction,
        [minterWallet],
        { commitment: "confirmed" }
      );
      console.log("TRANSFERRED IN TX:", transferSign);
    } catch (error) {
      console.log("ERROR IN MINTING:", error);
    }
    setLoading(false);
  };

  const capSupply = async () => {
    try {
      setLoading(true);

      // Creating wallet from minter's secret keys
      let secretKey = new Uint8Array(
        Object.values(JSON.parse(minterSecretKey))
      );
      const minterWallet = await Keypair.fromSecretKey(secretKey);

      let transaction = new Transaction();
      transaction.add(
        createSetAuthorityInstruction(
          new PublicKey(newTokenPubKey),
          minterWallet.publicKey,
          AuthorityType.MintTokens,
          null,
          []
        )
      );
      const setAuthoritySign = await sendAndConfirmTransaction(
        CONNECTION,
        transaction,
        [minterWallet],
        {
          commitment: "confirmed",
        }
      );

      console.log("MINTING CAPPED TX:", setAuthoritySign);
      setSupplyCapped(true);
    } catch (error) {
      console.log("ERROR IN CAPPING SUPPLY:", error);
    }
    setLoading(false);
  };

  const transferIt = async (sol = true) => {
    // SOL address can be 32-44 characters long
    // we are matching minimum
    if (transferAddress.length < 30) {
      console.log("INVALID ADDRESS:", transferAddress);
      return;
    }

    try {
      setLoading(true);
      let transferInstruction;
      const transaction = new Transaction({
        feePayer: provider.publicKey,
        recentBlockhash: await (
          await CONNECTION.getLatestBlockhash()
        ).blockhash,
      });

      if (sol) {
        transferInstruction = SystemProgram.transfer({
          fromPubkey: provider.publicKey,
          toPubkey: new PublicKey(transferAddress),
          lamports: 2 * LAMPORTS_PER_SOL,
        });
      } else {
        // Creating wallet from minter's secret keys
        let secretKey = new Uint8Array(
          Object.values(JSON.parse(minterSecretKey))
        );
        const minterWallet = await Keypair.fromSecretKey(secretKey);

        // Get/Create token account for the receiver's address and user's wallet
        const { minterTokenAccount, mintRequesterTokenAccount } =
          await getOrCreateTokenAccount(
            minterWallet, // Will sign the transaction to create account if not exist
            { publicKey: provider.publicKey }, // method accepts a wallet to return 'publicKey' TODO: update method
            new PublicKey(newTokenPubKey),
            new PublicKey(transferAddress)
          );

        transferInstruction = createTransferInstruction(
          minterTokenAccount.address, // from user's token account
          mintRequesterTokenAccount.address, // to receiver's account
          provider.publicKey, // owner of sender's token account(user)
          5 * 10 ** DECIMALS, // send 5 tokens
          [],
          TOKEN_PROGRAM_ID
        );
      }
      transaction.add(transferInstruction);

      // Provider's transfer transaction result
      // {
      //   "publicKey": "CuzFbe4QbhUGyUfYTPavhFERCQU4vLRcyD7ccm3TA6XF",
      //   "signature": "3f3v2vNVme2Y1jGCA8ahtUEz3wsD1ocPEJYV59xDRZKRKGfZdQ7ywiyzscFfgAZRaKY6cCoQSBApSS14n5e37ixY"
      // }
      const transferResult = await provider.signAndSendTransaction(transaction);
      console.log("PROVIDER RESULT:", transferResult);

      await CONNECTION.confirmTransaction(
        transferResult.signature,
        "confirmed"
      );
      console.log("TRANSFERRED!");
    } catch (error) {
      console.log("ERROR IN CAPPING SUPPLY:", error);
    }
    setLoading(false);
  };

  const onTransferInputChange = (e) => {
    setTransferAddress(e.target.value);
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
            {isTokenCreated ? <p>Token minted at: {newTokenPubKey}</p> : <></>}
            <div>
              <button onClick={mintInitialTokens} disabled={loading}>
                Initial Mint
              </button>
              <button
                onClick={mintMoreTokens}
                disabled={loading || supplyCapped || !isTokenCreated}
              >
                Mint More
              </button>
            </div>
          </>
        ) : (
          <></>
        )}

        {walletConnected ? (
          <>
            <p>Cap supply of your token</p>
            {supplyCapped ? <p>Token supply capped</p> : <></>}
            <button
              onClick={capSupply}
              disabled={loading || supplyCapped || !isTokenCreated}
            >
              Cap Supply
            </button>
          </>
        ) : (
          <></>
        )}

        {walletConnected ? (
          <>
            <p>
              Transfer <strong>5 tokens</strong> or <strong>2 SOL</strong>
              {!isTokenCreated ? " (Token not minted yet)" : ""}
            </p>

            <div>
              <input
                type={"text"}
                placeholder="SOL Address here..."
                onChange={onTransferInputChange}
              ></input>
              <button
                onClick={() => transferIt(false)}
                disabled={
                  loading || !isTokenCreated || transferAddress.length < 30
                }
              >
                Send 5 Tokens
              </button>
              <button
                onClick={() => transferIt()}
                disabled={loading || transferAddress.length < 30}
              >
                Send 2 SOL
              </button>
            </div>
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

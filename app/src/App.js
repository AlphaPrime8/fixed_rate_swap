import './App.css';
import { useState } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, Provider, web3 } from '@project-serum/anchor';
import { getPhantomWallet } from '@solana/wallet-adapter-wallets';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";

// const spl_token = require("@solana/spl-token");
const idl = require('./idl.json');
const metaplex = require("@metaplex/js");
require('@solana/wallet-adapter-react-ui/styles.css');

const wallets = [ getPhantomWallet() ]
// const network = "http://127.0.0.1:8899";
const network = clusterApiUrl('devnet');

const { SystemProgram, Keypair } = web3;
const baseAccount = Keypair.generate();
const opts = {
  preflightCommitment: "processed"
}
window.idl = idl;
const programID = new PublicKey(idl.metadata.address);

// declare token accounts
let mintA = null;
let mintB = null;
let initializerTokenAccountA = null;
let initializerTokenAccountB = null;
let takerTokenAccountA = null;
let takerTokenAccountB = null;

// declare swap amount params
const takerRate = 10;
const takerAmount = 10000000; // 10M
const swapAmount = takerAmount / 2;
const initializerAmount = (swapAmount * 2) * takerRate; // setup for two exchanges before depletion of supply

function App() {
  const [value, setValue] = useState('');
  const [dataList, setDataList] = useState([]);
  const [input, setInput] = useState('');
  const [mintSetupComplete, setMintSetupComplete] = useState(false);
  const wallet = useWallet()

  async function getProvider() {
    /* create the provider and return it to the caller */
    /* network set to local network for now */
    const connection = new Connection(network, opts.preflightCommitment);

    const provider = new Provider(
        connection, wallet, opts.preflightCommitment,
    );
    return provider;
  }

  async function getNftData() {
    const privKey = [216,203,114,212,61,127,24,46,108,53,212,228,23,126,248,124,72,139,254,44,177,176,132,204,100,205,16,145,26,12,92,56,68,4,33,19,46,78,84,151,141,18,127,173,233,103,235,16,19,143,164,217,248,245,89,84,96,118,12,209,39,86,48,143];
    const privArr = Uint8Array.from(privKey);
    const wallet = web3.Keypair.fromSecretKey(privArr);
    const provider = await getProvider();
    // const metaplex_connection = new metaplex.Connection('devnet');
    const metadata = await metaplex.programs.metadata.Metadata.load(provider.connection, wallet.publicKey.toString());
    console.log(metadata);
  }

  async function getNftData_old() {
    const privKey = [216,203,114,212,61,127,24,46,108,53,212,228,23,126,248,124,72,139,254,44,177,176,132,204,100,205,16,145,26,12,92,56,68,4,33,19,46,78,84,151,141,18,127,173,233,103,235,16,19,143,164,217,248,245,89,84,96,118,12,209,39,86,48,143];
    const privArr = Uint8Array.from(privKey);
    const wallet = web3.Keypair.fromSecretKey(privArr);
    const provider = await getProvider();
    let accounts = await provider.connection.getTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_PROGRAM_ID });
    const metaplex_connection = new metaplex.Connection('devnet');
    for (const account in accounts.value){
      let pubKey = accounts.value[account].pubkey.toString();
      console.log(pubKey);
      const metadata = await metaplex.programs.metadata.Metadata.load(metaplex_connection, pubKey);
      console.log(metadata);
    }
    window.accounts = accounts;
  }

  async function setupMints() {
    const provider = await getProvider();
    const mintAuthority = Keypair.generate();
    let payer = Keypair.generate();

    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(payer.publicKey, 10000000000),
        "confirmed"
    );

    mintA = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
    );

    mintB = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
    );

    initializerTokenAccountA = await mintA.createAccount(provider.wallet.publicKey);
    takerTokenAccountA = await mintA.createAccount(provider.wallet.publicKey);

    initializerTokenAccountB = await mintB.createAccount(provider.wallet.publicKey);
    takerTokenAccountB = await mintB.createAccount(provider.wallet.publicKey);

    await mintA.mintTo(
        initializerTokenAccountA,
        mintAuthority.publicKey,
        [mintAuthority],
        initializerAmount
    );

    await mintB.mintTo(
        takerTokenAccountB,
        mintAuthority.publicKey,
        [mintAuthority],
        takerAmount
    );

    // confirm
    let _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
    let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);

    console.log("Received expected initialierTokenAccountA amount %s", _initializerTokenAccountA.amount.toNumber() == initializerAmount);
    console.log("Received expected takerTokenAccountB amount %s", _takerTokenAccountB.amount.toNumber() == takerAmount);

    setMintSetupComplete(true);
  }

  async function initialize() {
    const provider = await getProvider();
    /* create the program interface combining the idl, program ID, and provider */
    const program = new Program(idl, programID, provider);
    try {
      /* interact with the program via rpc */
      await program.rpc.initialize("Hello World", {
        accounts: {
          baseAccount: baseAccount.publicKey,
          user: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [baseAccount]
      });

      const account = await program.account.baseAccount.fetch(baseAccount.publicKey);
      console.log('account: ', account);
      setValue(account.data.toString());
      setDataList(account.dataList);
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  async function update() {
    if (!input) return
    const provider = await getProvider();
    const program = new Program(idl, programID, provider);
    await program.rpc.update(input, {
      accounts: {
        baseAccount: baseAccount.publicKey
      }
    });

    const account = await program.account.baseAccount.fetch(baseAccount.publicKey);
    console.log('account: ', account);
    setValue(account.data.toString());
    setDataList(account.dataList);
    setInput('');
  }

  if (true) {
    return (
        <div className="App">
          <button onClick={getNftData}>Get NFT Data</button>
        </div>
    )
  }
  else if (!wallet.connected) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop:'100px' }}>
          <WalletMultiButton />
        </div>
    )
  } else if (!mintSetupComplete) {
    return (
        <div className="App">
          <button onClick={setupMints}>SetupMint</button>
        </div>
    )

  } else {
    return (
        <div className="App">
          <div>
            {
              !value && (<button onClick={initialize}>Initialize</button>)
            }

            {
              value ? (
                  <div>
                    <h2>Current value: {value}</h2>
                    <input
                        placeholder="Add new data"
                        onChange={e => setInput(e.target.value)}
                        value={input}
                    />
                    <button onClick={update}>Add data</button>
                  </div>
              ) : (
                  <h3>Please Inialize.</h3>
              )
            }
            {
              dataList.map((d, i) => <h4 key={i}>{d}</h4>)
            }
          </div>
        </div>
    );
  }
}

const AppWithProvider = () => (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
)

export default AppWithProvider;
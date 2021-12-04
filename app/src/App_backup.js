import './App.css';
import { useState } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, Provider, web3 } from '@project-serum/anchor';
import idl from './idl.json';

import { getPhantomWallet } from '@solana/wallet-adapter-wallets';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
require('@solana/wallet-adapter-react-ui/styles.css');
const metaplex = require("@metaplex/js");
const spl_token = require("@solana/spl-token");

const wallets = [ getPhantomWallet() ]
// const network = clusterApiUrl('mainnet-beta');
const network = clusterApiUrl('devnet');
// const network = "http://127.0.0.1:8899";


const { SystemProgram, Keypair } = web3;
const baseAccount = Keypair.generate();
const opts = {
    preflightCommitment: "processed"
}
const programID = new PublicKey(idl.metadata.address);

function App() {
    const [value, setValue] = useState('');
    const [dataList, setDataList] = useState([]);
    const [input, setInput] = useState('');
    const wallet = useWallet()
    // const [metadataData, setMetadataData] = useState<metaplex.programs.metadata.MetadataData>();

    async function getNftData() {

        const EXPECTED_COLLECTION_NAME = "alphaprime8-test-collection-0";
        const EXPECTED_CREATOR = "5aWNmcpfP9rUjEFkXFpFaxu6gnpWvBXeHLcxkseP4r8W";

        const connection = new Connection(network);
        const adapter = wallets[0].adapter();
        await adapter.connect();
        const balance = await connection.getBalance(adapter.publicKey);
        console.log("got balance: ", balance);

        let accounts = await connection.getTokenAccountsByOwner(adapter.publicKey, { programId: spl_token.TOKEN_PROGRAM_ID });

        let act = accounts.value[0];
        console.log("got act: ", act);

        let acctInfo = act.account;
        // let acctInfo = await connection.getAccountInfo(pk);
        console.log("got act info: ", acctInfo);

        let acctInfoDecoded = spl_token.AccountLayout.decode(Buffer.from(acctInfo.data));
        console.log("acct decoded: ", acctInfoDecoded);

        let mint = new PublicKey(acctInfoDecoded.mint);
        console.log("got mint: ", mint.toString());

        const pda = await metaplex.programs.metadata.Metadata.getPDA(mint.toString());
        console.log("got pda: ", pda);
        const metadata = await metaplex.programs.metadata.Metadata.load(connection, pda);
        console.log("got metadata: ", metadata);
        // metaplex.programs.metadata.MetadataData.
        let uri = metadata.data.data.uri;
        console.log("got uri: ", uri);
        let arweaveData = await (await fetch(uri)).json();
        console.log("got arweave data: ", arweaveData);
        const collection_name = arweaveData.collection.name;
        console.log("got collection: ", collection_name);

        // confirm creators
        let creators = metadata.data.data.creators;
        let onchain_addresses = [];
        for (const key in creators){
            onchain_addresses.push(creators[key].address);
        }
        console.log("got onchain creators", onchain_addresses);

        creators = arweaveData.properties.creators;
        let offchain_addresses = [];
        for (const key in creators){
            offchain_addresses.push(creators[key].address);
        }
        console.log("got offchain creators", offchain_addresses);

        const is_valid = (collection_name == EXPECTED_COLLECTION_NAME) && onchain_addresses.includes(EXPECTED_CREATOR) && offchain_addresses.includes(EXPECTED_CREATOR);
        console.log("IS VALID: ", is_valid);

    }

    async function getProvider() {
        /* create the provider and return it to the caller */
        /* network set to local network for now */
        // const network = "http://127.0.0.1:8899";
        // const network = clusterApiUrl('devnet');
        const connection = new Connection(network, opts.preflightCommitment);

        const provider = new Provider(
            connection, wallet, opts.preflightCommitment,
        );
        return provider;
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
                <div>
                    <button onClick={getNftData}>Get NFT Data</button>
                </div>
            </div>
        )
    }
    else if (!wallet.connected) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop:'100px' }}>
                <WalletMultiButton />
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
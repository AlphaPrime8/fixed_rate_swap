const web3 =  require('@solana/web3.js');
const spl_token = require("@solana/spl-token");
const metaplex = require("@metaplex/js");

const privKey = [216,203,114,212,61,127,24,46,108,53,212,228,23,126,248,124,72,139,254,44,177,176,132,204,100,205,16,145,26,12,92,56,68,4,33,19,46,78,84,151,141,18,127,173,233,103,235,16,19,143,164,217,248,245,89,84,96,118,12,209,39,86,48,143];
const privArr = Uint8Array.from(privKey);
const wallet = web3.Keypair.fromSecretKey(privArr);

(async () => {
    // Connect to cluster
    var connection = new web3.Connection(
        web3.clusterApiUrl('devnet'),
        'confirmed',
    );

    // Generate a new wallet keypair and airdrop SOL
    // var wallet = web3.Keypair.generate();
    // var airdropSignature = await connection.requestAirdrop(
    //     wallet.publicKey,
    //     web3.LAMPORTS_PER_SOL,
    // );

    //wait for airdrop confirmation
    // await connection.confirmTransaction(airdropSignature);

    // get account info
    // account data is bytecode that needs to be deserialized
    // serialization and deserialization is program specic
    // let account = await connection.getAccountInfo(pubKey);
    let account = await connection.getAccountInfo(wallet.publicKey);
    console.log(account);
    console.log(wallet.publicKey.toString());
    let accounts = await connection.getTokenAccountsByOwner(wallet.publicKey, { programId: spl_token.TOKEN_PROGRAM_ID });
    console.log(accounts);
    debugger;
    let metadata;
    let tokenPublicKey;
    for (let act in accounts.value){
        console.log(act.account, act.pubkey);
        tokenPublicKey = act.pubkey.toString();
        metadata = await metaplex.programs.metadata.Metadata.load(connection, tokenPublicKey);
        console.log(metadata);
    }



})();
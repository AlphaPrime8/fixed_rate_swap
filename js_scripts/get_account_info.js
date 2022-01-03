const web3 =  require('@solana/web3.js');
const spl_token = require("@solana/spl-token");
const metaplex = require("@metaplex/js");

const wallet = Keypair.fromSecretKey(Buffer.from(JSON.parse(require("fs").readFileSync("/home/myware/.config/solana/devnet.json", {encoding: "utf-8",}))));


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
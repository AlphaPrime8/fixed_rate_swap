import * as anchor from "@project-serum/anchor";
import { Program, BN, IdlAccounts } from "@project-serum/anchor";
import { PublicKey, Keypair, SystemProgram, Account, AccountInfo } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import { Escrow } from "../target/types/escrow";

type EscrowAccount = IdlAccounts<Escrow>["escrowAccount"];

describe("escrow", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrow as Program<Escrow>;

  let mintA: Token = null;
  let mintB: Token = null;
  let initializerTokenAccountA: PublicKey = null;
  let initializerTokenAccountB: PublicKey = null;
  let takerTokenAccountA: PublicKey = null;
  let takerTokenAccountB: PublicKey = null;
  let pda: PublicKey = null;

  const takerRate = 10;
  const takerAmount = 10000000; // 10M
  const swapAmount = takerAmount / 2;
  const initializerAmount = (swapAmount * 2) * takerRate; // setup for two exchanges before depletion of supply

  // TODO lookup pda for escrow account
  let escrowAccount: PublicKey;
  let stateSeedName = "state";
  function StateBumps() {
    this.escrowAccount;
  };
  let bumps = new StateBumps();


  //
  const payer = Keypair.generate();
  const mintAuthority = Keypair.generate();

  it("Initialise escrow state", async () => {
    // Airdropping tokens to a payer.
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

    initializerTokenAccountA = await mintA.createAccount(
      provider.wallet.publicKey
    );
    takerTokenAccountA = await mintA.createAccount(provider.wallet.publicKey);

    initializerTokenAccountB = await mintB.createAccount(
      provider.wallet.publicKey
    );
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

    let _initializerTokenAccountA = await mintA.getAccountInfo(
      initializerTokenAccountA
    );
    let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);

    assert.ok(_initializerTokenAccountA.amount.toNumber() == initializerAmount);
    assert.ok(_takerTokenAccountB.amount.toNumber() == takerAmount);
  });

  it("Initialize escrow", async () => {

    const [_tmpEC, escrowAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(stateSeedName)],
        program.programId
    );
    escrowAccount = _tmpEC;
    bumps.escrowAccount = escrowAccountBump;

    await program.rpc.initializeEscrow(
        new BN(initializerAmount),
        new BN(takerRate),
        bumps,
        stateSeedName,
        {
          accounts: {
            initializer: provider.wallet.publicKey,
            initializerDepositTokenAccount: initializerTokenAccountA,
            initializerReceiveTokenAccount: initializerTokenAccountB,
            escrowAccount: escrowAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
    );

    // Get the PDA that is assigned authority to token account.
    const [_pda, _nonce] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
      program.programId
    );

    pda = _pda;

    let _initializerTokenAccountA = await mintA.getAccountInfo(
      initializerTokenAccountA
    );

    let _escrowAccount =
      await program.account.escrowAccount.fetch(escrowAccount);

    // Check that the new owner is the PDA.
    assert.ok(_initializerTokenAccountA.owner.equals(pda));

    // Check that the values in the escrow account match what we expect.
    assert.ok(_escrowAccount.initializerKey.equals(provider.wallet.publicKey));
    assert.ok(_escrowAccount.initializerAmount.toNumber() == initializerAmount);
    assert.ok(_escrowAccount.takerRate.toNumber() == takerRate);
    assert.ok(
      _escrowAccount.initializerDepositTokenAccount.equals(
        initializerTokenAccountA
      )
    );
    assert.ok(
      _escrowAccount.initializerReceiveTokenAccount.equals(
        initializerTokenAccountB
      )
    );

  });

  it("Exchange 1 escrow", async () => {
    await program.rpc.exchange(
        new BN(swapAmount),
        {
          accounts: {
            taker: provider.wallet.publicKey,
            takerDepositTokenAccount: takerTokenAccountB,
            takerReceiveTokenAccount: takerTokenAccountA,
            pdaDepositTokenAccount: initializerTokenAccountA,
            initializerReceiveTokenAccount: initializerTokenAccountB,
            initializerMainAccount: provider.wallet.publicKey,
            escrowAccount: escrowAccount,
            pdaAccount: pda,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });

    let _takerTokenAccountA = await mintA.getAccountInfo(takerTokenAccountA);
    let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);
    let _initializerTokenAccountA = await mintA.getAccountInfo(
      initializerTokenAccountA
    );
    let _initializerTokenAccountB = await mintB.getAccountInfo(
      initializerTokenAccountB
    );

    // Check that the initializer gets back ownership of their token account.
    assert.ok(_takerTokenAccountA.owner.equals(provider.wallet.publicKey));

    assert.ok(_takerTokenAccountA.amount.toNumber() == swapAmount * takerRate);
    assert.ok(_initializerTokenAccountA.amount.toNumber() == (initializerAmount - (swapAmount * takerRate)));
    assert.ok(_initializerTokenAccountB.amount.toNumber() == swapAmount);
    assert.ok(_takerTokenAccountB.amount.toNumber() == takerAmount - swapAmount);
  });

  it("Exchange 2 escrow", async () => {
    await program.rpc.exchange(
        new BN(swapAmount),
        {
          accounts: {
            taker: provider.wallet.publicKey,
            takerDepositTokenAccount: takerTokenAccountB,
            takerReceiveTokenAccount: takerTokenAccountA,
            pdaDepositTokenAccount: initializerTokenAccountA,
            initializerReceiveTokenAccount: initializerTokenAccountB,
            initializerMainAccount: provider.wallet.publicKey,
            escrowAccount: escrowAccount,
            pdaAccount: pda,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });

    let _takerTokenAccountA = await mintA.getAccountInfo(takerTokenAccountA);
    assert.ok(_takerTokenAccountA.amount.toNumber() == 2*(swapAmount * takerRate));

  });

  it("Cancel escrow", async () => {

    // Check that PDA still owns initializer token accounts
    let _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
    let _initializerTokenAccountB = await mintB.getAccountInfo(initializerTokenAccountB);

    assert.ok(_initializerTokenAccountA.owner.equals(pda));
    assert.ok(_initializerTokenAccountB.owner.equals(pda));

    // Cancel the escrow.
    await program.rpc.cancelEscrow({
      accounts: {
        initializer: provider.wallet.publicKey,
        pdaDepositTokenAccount: initializerTokenAccountA,
        pdaReceiveTokenAccount: initializerTokenAccountB,
        pdaAccount: pda,
        escrowAccount: escrowAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    // Check the final owner should be the provider public key.
    _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
    _initializerTokenAccountB = await mintB.getAccountInfo(initializerTokenAccountB);

    assert.ok(_initializerTokenAccountA.owner.equals(provider.wallet.publicKey));
    assert.ok(_initializerTokenAccountB.owner.equals(provider.wallet.publicKey));

  });

});

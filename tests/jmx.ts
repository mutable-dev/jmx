import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { Jmx } from '../target/types/jmx';
import assert from "assert";

describe('jmx', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Jmx as Program<Jmx>;

  let vault: anchor.web3.PublicKey,
  exchangeAuthority,
  exchangeAuthorityBump,
  exchange,
  redeemableMint,
  redeemableMintBump;

  const exchangeAdmin = anchor.web3.Keypair.generate();

  it('Is initialized!', async () => {

    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    const publicConnection = new anchor.web3.Connection(
      "http://localhost:8899",
      "confirmed"
    );

    // Airdrop some SOL to the vault authority
    await publicConnection.confirmTransaction(
      await publicConnection.requestAirdrop(
        exchangeAdmin.publicKey,
        1.0 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
      ),
      "confirmed"
    );

    [redeemableMint] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("redeemable-mint"), Buffer.from('jmx')],
      program.programId
    );

    [exchangeAuthority] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("exchange-authority"), Buffer.from('jmx')],
      program.programId
    );

    [exchange] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('jmx')],
      program.programId
    );

    const tx = await program.rpc.initializeExchange(
      'jmx',
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority:exchangeAuthority,
          redeemableMint:redeemableMint,
          exchange: exchange,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      });

    let exchangeAccount = await provider.connection.getAccountInfo(
      exchange
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.taxBasisPoints.toNumber(), 8);
    assert.equal(exchangeAccountData.stableTaxBasisPoints.toNumber(), 4);
    assert.equal(exchangeAccountData.mintBurnBasisPoints.toNumber(), 15);
    assert.equal(exchangeAccountData.swapFeeBasisPoints.toNumber(), 30);
    assert.equal(exchangeAccountData.stableSwapFeeBasisPoints.toNumber(), 8);
    assert.equal(exchangeAccountData.marginFeeBasisPoints.toNumber(), 1);
    assert.equal(exchangeAccountData.liquidationFeeUsd.toNumber(), 40);
    assert.equal(exchangeAccountData.minProfitTime.toNumber(), 15);
    assert.equal(exchangeAccountData.totalWeights.toNumber(), 60);
    assert.equal(exchangeAccountData.admin.toString(), exchangeAdmin.publicKey.toString());
    assert.equal((String.fromCharCode.apply(null, exchangeAccountData.name)) === 'jmx                 ', true);
  });

  it('Updates asset whitelist', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [redeemableMint] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("redeemable-mint"), Buffer.from('jmx')],
      program.programId
    );

    [exchangeAuthority] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("exchange-authority"), Buffer.from('jmx')],
      program.programId
    );

    [exchange] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('jmx')],
      program.programId
    );

    const asset1 = anchor.web3.Keypair.generate();
    const asset2 = anchor.web3.Keypair.generate();


    const tx = await program.rpc.updateAssetWhitelist(
      'jmx',
      [asset1.publicKey, asset2.publicKey],
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority:exchangeAuthority,
          exchange: exchange,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ]
      }
    );
    let exchangeAccount = await provider.connection.getAccountInfo(
      exchange
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.assets[0].toString(), asset1.publicKey.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), asset2.publicKey.toString())
  });
});

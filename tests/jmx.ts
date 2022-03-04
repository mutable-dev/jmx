import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { Jmx } from '../target/types/jmx';

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
    console.log("Your transaction signature", tx);
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

    const tx = await program.rpc.updateAssetWhitelist(
      'jmx',
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
      });
    console.log("Your transaction signature", tx);
  });
});

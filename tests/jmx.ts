import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID} from "@solana/spl-token";
import BN from 'bn.js';
import { Struct, PublicKey } from '@solana/web3.js';
import { Jmx } from '../target/types/jmx';
import assert from "assert";

class AvailableAsset extends Struct {
  mintAddress: PublicKey;
	/// the decimals for the token
	tokenDecimals: BN;
	/// The weight of this token in the LP 
	tokenWeight: BN;
	/// min about of profit a position needs to be in to take profit before time
	minProfitBasisPoints: BN;
	/// maximum amount of this token that can be in the pool
	maxLptokenAmount: BN;
	/// Flag for whether this is a stable token
	stableToken: boolean;
	/// Flag for whether this asset is shortable
	shortableToken: boolean;
	/// The cumulative funding rate for the asset
	cumulativeFundingRate: BN;
	/// Last time the funding rate was updated
	lastFundingTime: BN;
	/// Account with price oracle data on the asset
	oracleAddress: PublicKey;
	/// Backup account with price oracle data on the asset
	backupOracleAddress: PublicKey;
	/// Global size of shorts denominated in kind
	globalShortSize: BN;
	/// Represents the total outstanding obligations of the protocol (position - size) for the asset
	netProtocolLiabilities: BN
}

describe('jmx', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Jmx as Program<Jmx>;

  let vault: anchor.web3.PublicKey,
  exchangeAuthorityPda,
  exchangePda,
  redeemableMintPda,
  availableAssetPda;

  const usdcMintPublicKey = new anchor.web3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  const exchangeName = 'jmx'
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

    [redeemableMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("redeemable-mint"), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("exchange-authority"), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    const tx = await program.rpc.initializeExchange(
      exchangeName,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority:exchangeAuthorityPda,
          redeemableMint:redeemableMintPda,
          exchange: exchangePda,
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
      exchangePda
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

  // Need to write test for adding multiple assets, 
  // removing some assets while adding some assets
  it('Updates asset whitelist and creates a new available asset', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [redeemableMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("redeemable-mint"), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("exchange-authority"), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    [availableAssetPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), usdcMintPublicKey.toBuffer()],
      program.programId
    );

    const asset1 = anchor.web3.Keypair.generate();
    const asset2 = anchor.web3.Keypair.generate();

    const availableAssetInputData = new AvailableAsset({
      tokenDecimals: new BN(1),
      tokenWeight: new BN(1),
      minProfitBasisPoints: new BN(1),
      maxLptokenAmount: new BN(1),
      stableToken: true,
      shortableToken: true,
      cumulativeFundingRate: new BN(0),
      lastFundingTime: new BN(0),
      oracleAddress: new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      backupOracleAddress: new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      globalShortSize: new BN(0),
      netProtocolLiabilities: new BN(0),
    })

    let tx = await program.rpc.initializeAvailableAsset(
      exchangeName,
      availableAssetInputData,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchange: exchangePda,
          mintAccount: new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
          availableAssetAccount: availableAssetPda,
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

   tx = await program.rpc.updateAssetWhitelist(
      exchangeName,
      [asset1.publicKey, asset2.publicKey],
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchange: exchangePda,
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
      exchangePda
    );
    const exchangeAccountData = program.coder.accounts.decode('Exchange', exchangeAccount.data)
    assert.equal(exchangeAccountData.assets[0].toString(), asset1.publicKey.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), asset2.publicKey.toString())

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPda
    );
    const availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    assert.equal(availableAssetAccountData.tokenDecimals.toNumber(), 1);
    assert.equal(availableAssetAccountData.tokenWeight.toNumber(), 1);
    assert.equal(availableAssetAccountData.minProfitBasisPoints.toNumber(), 1);
    assert.equal(availableAssetAccountData.maxLptokenAmount.toNumber(), 1);
    assert.equal(availableAssetAccountData.cumulativeFundingRate.toNumber(), 0);
    assert.equal(availableAssetAccountData.lastFundingTime.toNumber(), 0);
    assert.equal(availableAssetAccountData.stableToken, true);
    assert.equal(availableAssetAccountData.shortableToken, true);
    assert.equal(availableAssetAccountData.oracleAddress.toString(), usdcMintPublicKey.toString());
    assert.equal(availableAssetAccountData.backupOracleAddress.toString(), usdcMintPublicKey.toString());
    assert.equal(availableAssetAccountData.globalShortSize.toNumber(), 0);
    assert.equal(availableAssetAccountData.netProtocolLiabilities.toNumber(), 0);
    assert.equal(availableAssetAccountData.mintAddress.toString(), usdcMintPublicKey.toString());
  });
});

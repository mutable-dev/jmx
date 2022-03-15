import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, createMint, mintToChecked, createAssociatedTokenAccount, getAccount } from "@solana/spl-token";
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

const exchangeAuthoritySeed = 'exchange-authority'

describe('jmx', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Jmx as Program<Jmx>;

  let vault: anchor.web3.PublicKey,
  exchangeAuthorityPda,
  exchangeAuthorityBump,
  exchangePda,
  lpMintPda,
  availableAssetPdaUsdc,
  availableAssetPdaWSol,
  exchangeWSolPda,
  exchangeUSDCPda;

  const usdcMintPublicKey = new anchor.web3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  const usdcOraclePubkey = new anchor.web3.PublicKey('Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD')
  const wSolOraclePubkey = new anchor.web3.PublicKey('H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG')
  const exchangeName = 'jmx'
  const usdcSeed = 'usdc'
  const wSolSeed = 'wSol'
  const lpMintSeed = 'lp-mint'
  let fakeUsdcMint;
  let fakeWSolMint;
  let lpTokenAta;
  let remainingAccounts;

  const exchangeAdmin = anchor.web3.Keypair.generate();

  const publicConnection = new anchor.web3.Connection(
    "http://localhost:8899",
    "confirmed"
  );

  it('Is initialized!', async () => {

    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    // Airdrop some SOL to the vault authority
    await publicConnection.confirmTransaction(
      await publicConnection.requestAirdrop(
        exchangeAdmin.publicKey,
        1.0 * anchor.web3.LAMPORTS_PER_SOL // 1 SOL
      ),
      "confirmed"
    );

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    fakeUsdcMint = await createMint(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      exchangeAdmin.publicKey, // mint authority
      exchangeAdmin.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      8 // decimals
    );

    fakeWSolMint = await createMint(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      exchangeAdmin.publicKey, // mint authority
      exchangeAdmin.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      8 // decimals
    );

    const tx = await program.rpc.initializeExchange(
      exchangeName,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          lpMint: lpMintPda,
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
    assert.equal(exchangeAccountData.totalWeights.toNumber(), 0);
    assert.equal(exchangeAccountData.admin.toString(), exchangeAdmin.publicKey.toString());
    assert.equal((String.fromCharCode.apply(null, exchangeAccountData.name)) === 'jmx                 ', true);
  });

  // Need to write test for adding multiple assets, 
  // removing some assets while adding some assets
  it('Updates asset whitelist and creates a new available asset for USDC', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    [availableAssetPdaUsdc] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(usdcSeed)],
      program.programId
    );

    [exchangeUSDCPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(usdcSeed), Buffer.from(exchangeName)],
      program.programId
    );

    const availableAssetInputData = new AvailableAsset({
      mintAddress: fakeUsdcMint,
      tokenDecimals: new BN(1),
      tokenWeight: new BN(10000),
      minProfitBasisPoints: new BN(1),
      maxLptokenAmount: new BN(1),
      stableToken: true,
      shortableToken: true,
      cumulativeFundingRate: new BN(0),
      lastFundingTime: new BN(0),
      oracleAddress: usdcOraclePubkey,
      backupOracleAddress: usdcOraclePubkey,
      globalShortSize: new BN(0),
      netProtocolLiabilities: new BN(0),
    })

    let tx = await program.rpc.initializeAvailableAsset(
      exchangeName,
      usdcSeed,
      availableAssetInputData,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          exchange: exchangePda,
          mint: fakeUsdcMint,
          availableAsset: availableAssetPdaUsdc,
          exchangeReserveToken: exchangeUSDCPda,
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
      [fakeUsdcMint, fakeWSolMint],
      [usdcOraclePubkey, wSolOraclePubkey],
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
    assert.equal(exchangeAccountData.assets[0].toString(), fakeUsdcMint.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), fakeWSolMint.toString())

    assert.equal(exchangeAccountData.priceOracles[0].toString(), usdcOraclePubkey.toString());
    assert.equal(exchangeAccountData.priceOracles[1].toString(), wSolOraclePubkey.toString())
    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    const availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    assert.equal(availableAssetAccountData.tokenDecimals.toNumber(), 1);
    assert.equal(availableAssetAccountData.tokenWeight.toNumber(), 10000);
    assert.equal(availableAssetAccountData.minProfitBasisPoints.toNumber(), 1);
    assert.equal(availableAssetAccountData.maxLptokenAmount.toNumber(), 1);
    assert.equal(availableAssetAccountData.cumulativeFundingRate.toNumber(), 0);
    assert.equal(availableAssetAccountData.lastFundingTime.toNumber(), 0);
    assert.equal(availableAssetAccountData.stableToken, true);
    assert.equal(availableAssetAccountData.shortableToken, true);
    assert.equal(availableAssetAccountData.oracleAddress.toString(), usdcOraclePubkey.toString());
    assert.equal(availableAssetAccountData.backupOracleAddress.toString(), usdcOraclePubkey.toString());
    assert.equal(availableAssetAccountData.globalShortSize.toNumber(), 0);
    assert.equal(availableAssetAccountData.netProtocolLiabilities.toNumber(), 0);
    assert.equal(availableAssetAccountData.mintAddress.toString(), fakeUsdcMint.toString());
    assert.equal(availableAssetAccountData.poolReserves.toNumber(), 0);

    let exchangeAccountInfo = await provider.connection.getAccountInfo(
      exchangePda
    );
    const exchangeAccountInfoData = program.coder.accounts.decode('Exchange', exchangeAccountInfo.data)
    assert.equal(exchangeAccountInfoData.totalWeights, 10000)
  });

  it('Creates a new available asset for wSol', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    [availableAssetPdaWSol] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(wSolSeed)],
      program.programId
    );

    [exchangeWSolPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(wSolSeed), Buffer.from(exchangeName)],
      program.programId
    );

    const availableAssetInputData = new AvailableAsset({
      mintAddress: fakeWSolMint,
      tokenDecimals: new BN(1),
      tokenWeight: new BN(10000),
      minProfitBasisPoints: new BN(1),
      maxLptokenAmount: new BN(1),
      stableToken: true,
      shortableToken: true,
      cumulativeFundingRate: new BN(0),
      lastFundingTime: new BN(0),
      oracleAddress: wSolOraclePubkey,
      backupOracleAddress: wSolOraclePubkey,
      globalShortSize: new BN(0),
      netProtocolLiabilities: new BN(0),
    })

    let tx = await program.rpc.initializeAvailableAsset(
      exchangeName,
      wSolSeed,
      availableAssetInputData,
      {
        accounts: {
          exchangeAdmin: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda, 
          exchange: exchangePda,
          mint: fakeWSolMint,
          availableAsset: availableAssetPdaWSol,
          exchangeReserveToken: exchangeWSolPda,
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
      [fakeUsdcMint, fakeWSolMint],
      [usdcOraclePubkey, wSolOraclePubkey],
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
    assert.equal(exchangeAccountData.assets[0].toString(), fakeUsdcMint.toString());
    assert.equal(exchangeAccountData.assets[1].toString(), fakeWSolMint.toString())

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    const availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    assert.equal(availableAssetAccountData.tokenDecimals.toNumber(), 1);
    assert.equal(availableAssetAccountData.tokenWeight.toNumber(), 10000);
    assert.equal(availableAssetAccountData.minProfitBasisPoints.toNumber(), 1);
    assert.equal(availableAssetAccountData.maxLptokenAmount.toNumber(), 1);
    assert.equal(availableAssetAccountData.cumulativeFundingRate.toNumber(), 0);
    assert.equal(availableAssetAccountData.lastFundingTime.toNumber(), 0);
    assert.equal(availableAssetAccountData.stableToken, true);
    assert.equal(availableAssetAccountData.shortableToken, true);
    assert.equal(availableAssetAccountData.oracleAddress.toString(), wSolOraclePubkey.toString());
    assert.equal(availableAssetAccountData.backupOracleAddress.toString(), wSolOraclePubkey.toString());
    assert.equal(availableAssetAccountData.globalShortSize.toNumber(), 0);
    assert.equal(availableAssetAccountData.netProtocolLiabilities.toNumber(), 0);
    assert.equal(availableAssetAccountData.mintAddress.toString(), fakeWSolMint.toString());
    assert.equal(availableAssetAccountData.poolReserves.toNumber(), 0);
  });

  it('mints LP with USDC for the first and second time', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    [availableAssetPdaUsdc] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(usdcSeed)],
      program.programId
    );

    [exchangeUSDCPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(usdcSeed), Buffer.from(exchangeName)],
      program.programId
    );

    let fakeUsdcAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeUsdcMint, // mint
      exchangeAdmin.publicKey // owner,
    );

    let fakeUsdcMintTx = await mintToChecked(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeUsdcMint, // mint
      fakeUsdcAta, // receiver (sholud be a token account)
      exchangeAdmin, // mint authority
      1e8, // amount. if your decimals is 8, you mint 10^8 for 1 token.
      8 // decimals
    );

    lpTokenAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      lpMintPda, // mint
      exchangeAdmin.publicKey // owner,
    );

    remainingAccounts = [
      {
        pubkey: exchangeUSDCPda,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: new anchor.web3.PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: exchangeWSolPda,
        isWritable: false,
        isSigner: false
      },
      {
        pubkey: new anchor.web3.PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
        isWritable: false,
        isSigner: false
      },
    ]

    let tx = await program.rpc.mintLpToken(
      exchangeName,
      usdcSeed,
      new BN(1000),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeUsdcAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeUSDCPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaUsdc,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    let user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    let availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)

    assert.equal(Number(availableAssetAccountData.poolReserves) === 1000, true);
    assert.equal(Number(availableAssetAccountData.feeReserves) === 0, true);
    assert.equal(Number(user_lp_token_account.amount) > 995, true);

    let tx2 = await program.rpc.mintLpToken(
      exchangeName,
      usdcSeed,
      new BN(1000),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeUsdcAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeUSDCPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaUsdc,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )
    availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaUsdc
    );
    availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)

    assert.equal(availableAssetAccountData.poolReserves.toNumber() >= 1970, true);
    assert.equal(availableAssetAccountData.feeReserves.toNumber() >= 2, true);
    assert.equal(Number(user_lp_token_account.amount) >= 1970, true);
    assert.equal(Number(user_lp_token_account.amount) <= 2030, true);

  });

  it('mints LP with wSOL for the first and second time and then burns', async () => {
    const provider = anchor.Provider.env()
    anchor.setProvider(provider);

    [lpMintPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(lpMintSeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangeAuthorityPda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeAuthoritySeed), Buffer.from(exchangeName)],
      program.programId
    );

    [exchangePda] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName)],
      program.programId
    );

    [availableAssetPdaWSol] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(exchangeName), Buffer.from(wSolSeed)],
      program.programId
    );

    [exchangeWSolPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(wSolSeed), Buffer.from(exchangeName)],
      program.programId
    );

    let fakeWSolAta = await createAssociatedTokenAccount(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeWSolMint, // mint
      exchangeAdmin.publicKey // owner,
    );

    let fakeWSolMintTx = await mintToChecked(
      publicConnection, // connection
      exchangeAdmin, // fee payer
      fakeWSolMint, // mint
      fakeWSolAta, // receiver (sholud be a token account)
      exchangeAdmin, // mint authority
      1e8, // amount. if your decimals is 8, you mint 10^8 for 1 token.
      8 // decimals
    );

    let tx = await program.rpc.mintLpToken(
      exchangeName,
      wSolSeed,
      new BN(10),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    let user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    assert.equal(Number(user_lp_token_account.amount) >= 700, true);

    let tx2 = await program.rpc.mintLpToken(
      exchangeName,
      wSolSeed,
      new BN(10),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )
    let availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    let availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)
    console.log("availableAssetAccountData sol", availableAssetAccountData.poolReserves.toNumber());
    console.log("Number(user_lp_token_account.amount)", Number(user_lp_token_account.amount))
    assert.equal(availableAssetAccountData.poolReserves.toNumber() >= 18, true);
    assert.equal(availableAssetAccountData.feeReserves.toNumber() >= 1, true);
    assert.equal(Number(user_lp_token_account.amount) >= 3400, true);
    assert.equal(Number(user_lp_token_account.amount) <= 4000, true);

    let tx3 = await program.rpc.burnLpToken(
      exchangeName,
      wSolSeed,
      new BN(700),
      {
        accounts: {
          userAuthority: exchangeAdmin.publicKey,
          exchangeAuthority: exchangeAuthorityPda,
          userReserveToken: fakeWSolAta,
          userLpToken: lpTokenAta,
          exchange: exchangePda,
          exchangeReserveToken: exchangeWSolPda,
          lpMint: lpMintPda,
          availableAsset: availableAssetPdaWSol,
          //System stuff
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [
          exchangeAdmin
        ],
        remainingAccounts: remainingAccounts
      }
    );

    await sleep(400)

    user_lp_token_account = await getAccount(
      publicConnection,
      lpTokenAta,
      'confirmed'
    )

    let wSolExchangeTokenAccount = await getAccount(
      publicConnection,
      exchangeWSolPda,
      'confirmed'
    )

    availableAssetAccount = await provider.connection.getAccountInfo(
      availableAssetPdaWSol
    );
    availableAssetAccountData = program.coder.accounts.decode('AvailableAsset', availableAssetAccount.data)


    let wSolPoolReserves = availableAssetAccountData.poolReserves.toNumber()
    let wSolPoolFees = availableAssetAccountData.feeReserves.toNumber()

    console.log("wSolPoolReserves", wSolPoolReserves)
    console.log("wSolPoolFees", wSolPoolFees)
    // console.log("wSolExchangeTokenAccount", wSolExchangeTokenAccount)
    assert.equal(wSolPoolReserves >= 8, true);
    assert.equal(wSolPoolFees >= 2, true);
    assert.equal(Number(wSolExchangeTokenAccount.amount), 13);
    assert.equal(Number(wSolExchangeTokenAccount.amount), wSolPoolReserves + wSolPoolFees);
    assert.equal(Number(user_lp_token_account.amount) >= 2700, true);
    assert.equal(Number(user_lp_token_account.amount) <= 3300, true);
  });
});

export function sleep(ms) {
  console.log("Sleeping for", ms / 1000, "seconds");
  return new Promise((resolve) => setTimeout(resolve, ms));
}